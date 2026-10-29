import Decimal from 'decimal.js'
import { D } from './money'
import { addDays } from '~/lib/format/date'
import type { Id, IsoDate, Money } from './types'
import type { PlanStatus } from './aging'

export type PaymentPlanDay = {
  date: IsoDate
  opening: Money
  inflow: Money
  outflow: Money
  closing: Money
  isNegative: boolean
  status: { approved: Money; submitted: Money; notSubmitted: Money }
}

export type ApItemForPlan = {
  invoiceId: Id
  dueDate: IsoDate
  balance: Money
  status: PlanStatus
}

export type ArItemForPlan = {
  dueDate: IsoDate
  balance: Money
}

export type UnsettledBankForPlan = {
  coaId: Id
  txDate: IsoDate
  amount: Money
}

export function buildPaymentPlan(input: {
  today: IsoDate
  horizon: number
  inflow: boolean
  openingCash: Money
  apItems: ApItemForPlan[]
  arItems: ArItemForPlan[]
  unsettled: UnsettledBankForPlan[]
  settlementLags: Map<Id, number>
}): {
  openingBalance: Money
  overdue: Money
  days: PaymentPlanDay[]
} {
  const {
    today,
    horizon,
    inflow: includeInflow,
    openingCash,
    apItems,
    arItems,
    unsettled,
    settlementLags,
  } = input

  // 1. Separate overdue AP (< today) vs future/today AP
  let overdueDec = D(0)
  const overdueStatus = {
    approved: D(0),
    submitted: D(0),
    notSubmitted: D(0),
  }

  const apByDate = new Map<IsoDate, ApItemForPlan[]>()

  for (const item of apItems) {
    const bal = D(item.balance)
    if (bal.lte(0)) continue // Only positive outstanding bills

    if (item.dueDate < today) {
      overdueDec = overdueDec.plus(bal)
      overdueStatus[item.status] = overdueStatus[item.status].plus(bal)
    } else {
      const list = apByDate.get(item.dueDate) ?? []
      list.push(item)
      apByDate.set(item.dueDate, list)
    }
  }

  // 2. Pre-index AR by dueDate
  const arByDate = new Map<IsoDate, Decimal>()
  if (includeInflow) {
    for (const item of arItems) {
      const bal = D(item.balance)
      if (bal.gt(0)) {
        arByDate.set(
          item.dueDate,
          (arByDate.get(item.dueDate) ?? D(0)).plus(bal),
        )
      }
    }
  }

  // 3. Pre-index unsettled bank payments by estimated date
  const bankInflowByDate = new Map<IsoDate, Decimal>()
  if (includeInflow) {
    const minEstDate = addDays(today, 1)

    for (const u of unsettled) {
      const lag = settlementLags.get(u.coaId) ?? 1
      const lagDays = Math.max(1, Math.ceil(lag))
      const rawEst = addDays(u.txDate, lagDays)
      const estDate = rawEst < minEstDate ? minEstDate : rawEst

      const amt = D(u.amount)
      bankInflowByDate.set(
        estDate,
        (bankInflowByDate.get(estDate) ?? D(0)).plus(amt),
      )
    }
  }

  // 4. Build daily sequence
  const days: PaymentPlanDay[] = []
  let currOpening = D(openingCash)

  for (let h = 0; h < horizon; h++) {
    const date = addDays(today, h)

    // Outflows
    let dayOutflow = D(0)
    const dayStatus = {
      approved: D(0),
      submitted: D(0),
      notSubmitted: D(0),
    }

    const items = apByDate.get(date) ?? []
    for (const item of items) {
      const bal = D(item.balance)
      dayOutflow = dayOutflow.plus(bal)
      dayStatus[item.status] = dayStatus[item.status].plus(bal)
    }

    if (h === 0) {
      // Day 0 bears the overdue amount
      dayOutflow = dayOutflow.plus(overdueDec)
      dayStatus.approved = dayStatus.approved.plus(overdueStatus.approved)
      dayStatus.submitted = dayStatus.submitted.plus(overdueStatus.submitted)
      dayStatus.notSubmitted = dayStatus.notSubmitted.plus(
        overdueStatus.notSubmitted,
      )
    }

    // Inflows
    let dayInflow = D(0)
    if (includeInflow) {
      const arAmt = arByDate.get(date) ?? D(0)
      const bankAmt = bankInflowByDate.get(date) ?? D(0)
      dayInflow = arAmt.plus(bankAmt)
    }

    // Closing
    const closing = currOpening.plus(dayInflow).minus(dayOutflow)
    const isNegative = closing.lt(0)

    days.push({
      date,
      opening: currOpening.toFixed(2),
      inflow: dayInflow.toFixed(2),
      outflow: dayOutflow.toFixed(2),
      closing: closing.toFixed(2),
      isNegative,
      status: {
        approved: dayStatus.approved.toFixed(2),
        submitted: dayStatus.submitted.toFixed(2),
        notSubmitted: dayStatus.notSubmitted.toFixed(2),
      },
    })

    currOpening = closing
  }

  return {
    openingBalance: D(openingCash).toFixed(2),
    overdue: overdueDec.toFixed(2),
    days,
  }
}

/** A vendor bill due inside the payment-plan horizon. */
export type PaymentPlanBill = {
  invoiceId: Id
  vendorId: Id
  vendorName: string
  invoiceNumber: string
  dueDate: string
  balance: Money
  status: string
}
