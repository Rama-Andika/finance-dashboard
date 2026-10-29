import '@tanstack/react-start/server-only'
import { D } from '~/lib/finance/money'
import { addDays } from '~/lib/format/date'
import type { Id, MetricMeta, Money } from '~/lib/finance/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
} from '~/server/context'
import { loadAccountMapping } from '~/server/services/mapping.helper'
import { resolveBaskets } from '~/lib/finance/basket-resolver'
import { computeCashPosition } from '~/server/services/cash-position.service'
import {
  apAgingPartA,
  arAgingPartA,
  listPlanStatuses,
  listVendors,
} from '~/server/repo/apar.repo'
import {
  unsettledByChannel,
  settlementLag,
} from '~/server/repo/bank-payment.repo'
import { planStatus } from '~/lib/finance/aging'
import {
  buildPaymentPlan,
  type ApItemForPlan,
  type ArItemForPlan,
  type PaymentPlanDay,
  type UnsettledBankForPlan,
} from '~/lib/finance/payment-plan'

export type PaymentPlanBill = {
  invoiceId: Id
  vendorId: Id
  vendorName: string
  invoiceNumber: string
  dueDate: string
  balance: Money
  status: string
}

export type PaymentPlanResult = {
  meta: MetricMeta
  openingBalance: Money
  overdue: Money
  days: PaymentPlanDay[]
  bills: PaymentPlanBill[]
}

export type PaymentPlanOptions = {
  horizon: '7' | '14' | '30'
  inflow: boolean
}

export async function computePaymentPlan(
  filter: AppContextFilter,
  opts: PaymentPlanOptions,
): Promise<PaymentPlanResult> {
  const meta = buildMetricMeta(filter)
  const today = filter.today
  const asOfPlusOne = addDays(today, 1)

  // 1. Opening Cash = Cash Position at today
  const cashPos = await computeCashPosition(
    { ...filter, asOf: today },
    { includeByEntity: false, includeCompare: false },
  )
  const openingCash = cashPos.cashPosition

  // 2. AP items due at today or later, or overdue
  const rawAp = await apAgingPartA(asOfPlusOne, filter.locationIds)
  const apPositive = rawAp.filter((a) => D(a.balance).gt(0))

  const invoiceIds = apPositive.map((a) => a.invoiceId)
  const statusRows = await listPlanStatuses(invoiceIds)
  const statusMap = new Map<Id, string[]>()
  for (const r of statusRows) {
    const list = statusMap.get(r.invoiceId) ?? []
    list.push(r.status)
    statusMap.set(r.invoiceId, list)
  }

  const apItems: ApItemForPlan[] = apPositive.map((a) => ({
    invoiceId: a.invoiceId,
    dueDate: a.dueDate || a.txDate,
    balance: a.balance,
    status: planStatus(statusMap.get(a.invoiceId) ?? []),
  }))

  // 3. Inflows (AR + bank payments unsettled)
  let arItems: ArItemForPlan[] = []
  let unsettled: UnsettledBankForPlan[] = []
  const settlementLags = new Map<Id, number>()

  if (opts.inflow) {
    const rawAr = await arAgingPartA(asOfPlusOne, filter.locationIds)
    arItems = rawAr
      .filter((a) => D(a.balance).gt(0))
      .map((a) => ({
        dueDate: a.dueDate || a.txDate,
        balance: a.balance,
      }))

    const tree = await getCachedCoaTree()
    const mapping = await loadAccountMapping(tree)
    const resolved = resolveBaskets(mapping, tree)
    const inTransitIds = resolved.inTransit

    if (inTransitIds.length > 0) {
      const unsettledRows = await unsettledByChannel(
        today,
        inTransitIds,
        filter.segmentDetailIds,
        filter.entitySegmentColumn,
      )
      unsettled = unsettledRows.map((u) => ({
        coaId: u.coaId,
        txDate: u.txDate,
        amount: u.amount,
      }))

      const lagRows = await settlementLag(today, inTransitIds)
      for (const l of lagRows) {
        settlementLags.set(l.coaId, l.avgLag)
      }
    }
  }

  // 4. Projection
  const horizon = Number(opts.horizon) || 7
  const res = buildPaymentPlan({
    today,
    horizon,
    inflow: opts.inflow,
    openingCash,
    apItems,
    arItems,
    unsettled,
    settlementLags,
  })

  // 5. Bills due in horizon
  const lastDay = addDays(today, horizon - 1)
  const horizonBills = apPositive.filter((a) => {
    const d = a.dueDate || a.txDate
    return d <= lastDay
  })
  const vendorIds = Array.from(new Set(horizonBills.map((b) => b.vendorId)))
  const vendorList = await listVendors(vendorIds)
  const vendorMap = new Map(vendorList.map((v) => [v.vendorId, v.name]))

  const bills: PaymentPlanBill[] = horizonBills.map((b) => ({
    invoiceId: b.invoiceId,
    vendorId: b.vendorId,
    vendorName: vendorMap.get(b.vendorId) || b.vendorId,
    invoiceNumber: b.invoiceNumber || b.invoiceId,
    dueDate: b.dueDate || b.txDate,
    balance: b.balance,
    status: planStatus(statusMap.get(b.invoiceId) ?? []),
  }))

  return {
    meta,
    openingBalance: res.openingBalance,
    overdue: res.overdue,
    days: res.days,
    bills,
  }
}
