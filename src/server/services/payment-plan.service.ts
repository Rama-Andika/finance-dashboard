import { memoMetric } from '~/server/cache'
import { paginate, type Page, type TableQuery } from '~/lib/table/query'
import { paymentBillComparators } from '~/lib/finance/payment-plan-bills'
import type { PaymentPlanBill } from '~/lib/finance/payment-plan'
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
  apOpenInvoices,
  arOpenInvoices,
  listActivePlanStatuses,
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

export type { PaymentPlanBill }

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

export function computePaymentPlan(
  filter: AppContextFilter,
  opts: PaymentPlanOptions,
): Promise<PaymentPlanResult> {
  return memoMetric('paymentPlan', { filter, opts }, () => computePaymentPlanUncached(filter, opts))
}

async function computePaymentPlanUncached(
  filter: AppContextFilter,
  opts: PaymentPlanOptions,
): Promise<PaymentPlanResult> {
  const meta = buildMetricMeta(filter)
  const today = filter.today
  const asOfPlusOne = addDays(today, 1)

  // 1. Opening Cash = Cash Position at today
  // 2. AP items due at today or later, or overdue (independent of the opening cash)
  // 3. Live payment vouchers: ONE query for every invoice (not one query per 1000 open invoices)
  const [cashPos, rawAp, statusRows] = await Promise.all([
    computeCashPosition({ ...filter, asOf: today }, { includeByEntity: false, includeCompare: false }),
    apOpenInvoices(asOfPlusOne, filter.locationIds),
    listActivePlanStatuses(),
  ])
  const openingCash = cashPos.cashPosition
  const horizon = Number(opts.horizon) || 7
  const lastDay = addDays(today, horizon - 1)
  // Bills due after the horizon change nothing in the plan, so they are left out here.
  const apPositive = rawAp.filter((a) => D(a.balance).gt(0) && (a.dueDate || a.txDate) <= lastDay)

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

  // 4. Inflows (AR + bank payments unsettled)
  let arItems: ArItemForPlan[] = []
  let unsettled: UnsettledBankForPlan[] = []
  const settlementLags = new Map<Id, number>()

  if (opts.inflow) {
    const tree = await getCachedCoaTree()
    const resolved = resolveBaskets(await loadAccountMapping(tree), tree)
    const inTransitIds = resolved.inTransit

    const [rawAr, unsettledRows, lagRows] = await Promise.all([
      arOpenInvoices(asOfPlusOne, filter.locationIds),
      inTransitIds.length > 0
        ? unsettledByChannel(today, inTransitIds, filter.segmentDetailIds, filter.entitySegmentColumn)
        : Promise.resolve([]),
      inTransitIds.length > 0 ? settlementLag(today, inTransitIds) : Promise.resolve([]),
    ])

    arItems = rawAr
      .filter((a) => D(a.balance).gt(0))
      .map((a) => ({
        dueDate: a.dueDate || a.txDate,
        balance: a.balance,
      }))

    unsettled = unsettledRows.map((u) => ({
      coaId: u.coaId,
      txDate: u.txDate,
      amount: u.amount,
    }))
    for (const l of lagRows) {
      settlementLags.set(l.coaId, l.avgLag)
    }
  }

  // 5. Projection
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

  // 6. Bills due in horizon (apPositive already holds only those, overdue included)
  const horizonBills = apPositive
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

/** One sorted page of the bills due in the horizon (the plan itself is memoized, so paging does not re-query). */
export async function listPaymentPlanBills(
  filter: AppContextFilter,
  opts: PaymentPlanOptions,
  query: TableQuery,
): Promise<Page<PaymentPlanBill>> {
  const plan = await computePaymentPlan(filter, opts)
  return paginate(plan.bills, query, paymentBillComparators)
}
