import Decimal from 'decimal.js'
import { D, sum } from '../../core/money'
import { addDays } from '~/lib/format/date'
import type { Id, IsoDate, Money } from '../../core/types'
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

type StatusAmounts = Record<PlanStatus, Decimal>

const emptyStatus = (): StatusAmounts => ({ approved: D(0), submitted: D(0), notSubmitted: D(0) })

const statusToMoney = (status: StatusAmounts): PaymentPlanDay['status'] => ({
  approved: status.approved.toFixed(2),
  submitted: status.submitted.toFixed(2),
  notSubmitted: status.notSubmitted.toFixed(2),
})

function addTo<K>(map: Map<K, Decimal>, key: K, amount: Decimal): void {
  map.set(key, (map.get(key) ?? D(0)).plus(amount))
}

/**
 * Open bills (balance > 0) split into the overdue ones (due before today, per plan status)
 * and the others grouped by due date.
 */
function splitApByDueDate(apItems: ApItemForPlan[], today: IsoDate) {
  let overdue = D(0)
  const overdueStatus = emptyStatus()
  const apByDate = new Map<IsoDate, ApItemForPlan[]>()

  for (const item of apItems) {
    const bal = D(item.balance)
    if (bal.lte(0)) continue // Only positive outstanding bills

    if (item.dueDate < today) {
      overdue = overdue.plus(bal)
      overdueStatus[item.status] = overdueStatus[item.status].plus(bal)
    } else {
      const list = apByDate.get(item.dueDate) ?? []
      list.push(item)
      apByDate.set(item.dueDate, list)
    }
  }
  return { overdue, overdueStatus, apByDate }
}

/** Open receivables (balance > 0) summed per due date. */
function indexArByDate(arItems: ArItemForPlan[]): Map<IsoDate, Decimal> {
  const arByDate = new Map<IsoDate, Decimal>()
  for (const item of arItems) {
    const bal = D(item.balance)
    if (bal.gt(0)) addTo(arByDate, item.dueDate, bal)
  }
  return arByDate
}

/** Money not yet settled by the bank, summed per estimated settlement date (never earlier than tomorrow). */
function indexBankInflowByDate(
  unsettled: UnsettledBankForPlan[],
  today: IsoDate,
  settlementLags: Map<Id, number>,
): Map<IsoDate, Decimal> {
  const minEstDate = addDays(today, 1)
  const bankInflowByDate = new Map<IsoDate, Decimal>()

  for (const u of unsettled) {
    const lag = settlementLags.get(u.coaId) ?? 1
    const rawEst = addDays(u.txDate, Math.max(1, Math.ceil(lag)))
    addTo(bankInflowByDate, rawEst < minEstDate ? minEstDate : rawEst, D(u.amount))
  }
  return bankInflowByDate
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
  const { today, horizon, inflow: includeInflow, openingCash, apItems, arItems, unsettled, settlementLags } = input

  const { overdue, overdueStatus, apByDate } = splitApByDueDate(apItems, today)
  const arByDate = includeInflow ? indexArByDate(arItems) : new Map<IsoDate, Decimal>()
  const bankInflowByDate = includeInflow ? indexBankInflowByDate(unsettled, today, settlementLags) : new Map<IsoDate, Decimal>()

  const days: PaymentPlanDay[] = []
  let opening = D(openingCash)

  for (let h = 0; h < horizon; h++) {
    const date = addDays(today, h)

    let outflow = D(0)
    const dayStatus = emptyStatus()
    for (const item of apByDate.get(date) ?? []) {
      const bal = D(item.balance)
      outflow = outflow.plus(bal)
      dayStatus[item.status] = dayStatus[item.status].plus(bal)
    }

    if (h === 0) {
      // Day 0 bears the overdue amount
      outflow = outflow.plus(overdue)
      for (const status of ['approved', 'submitted', 'notSubmitted'] as const) {
        dayStatus[status] = dayStatus[status].plus(overdueStatus[status])
      }
    }

    const inflow = (arByDate.get(date) ?? D(0)).plus(bankInflowByDate.get(date) ?? D(0))
    const closing = opening.plus(inflow).minus(outflow)

    days.push({
      date,
      opening: opening.toFixed(2),
      inflow: inflow.toFixed(2),
      outflow: outflow.toFixed(2),
      closing: closing.toFixed(2),
      isNegative: closing.lt(0),
      status: statusToMoney(dayStatus),
    })
    opening = closing
  }

  return {
    openingBalance: D(openingCash).toFixed(2),
    overdue: overdue.toFixed(2),
    days,
  }
}

/** A vendor bill due inside the payment-plan horizon. */
export type PaymentPlanBill = {
  invoiceId: Id
  vendorId: Id
  vendorName: string
  /** Name of the entity (location) that owns the bill; null when the bill has no known entity. */
  entityName: string | null
  invoiceNumber: string
  dueDate: string
  balance: Money
  status: string
  /** Due before today (a missing due date falls back to the transaction date). */
  overdue: boolean
}

/** Headline numbers of a plan: everything going out (overdue + all days) and the lowest closing balance. */
export function summarizePlan(plan: { openingBalance: Money; overdue: Money; days: PaymentPlanDay[] }): {
  totalOutflow: Money
  minClosing: Money
} {
  const totalOutflow = sum([plan.overdue, ...plan.days.map((d) => d.outflow)])
  let minClosing = plan.openingBalance
  for (const d of plan.days) {
    if (D(d.closing).lt(D(minClosing))) minClosing = d.closing
  }
  return { totalOutflow, minClosing }
}
