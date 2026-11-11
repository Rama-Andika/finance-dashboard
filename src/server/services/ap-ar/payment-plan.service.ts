import '@tanstack/react-start/server-only'
import { memoMetric } from '~/server/cache'
import { createViewCache, pageOfSorted, sortRows, type Comparator, type Page, type TableQuery } from '~/lib/table/query'
import {
  paymentBillComparators,
  filterBillsByScope,
  summarizeBillScopes,
  type BillScope,
  type BillScopeSummary,
} from '~/lib/finance/ap-ar/payment-plan-bills'
import type { PaymentPlanBill } from '~/lib/finance/ap-ar/payment-plan'
import { D } from '~/lib/core/money'
import { buildEntityOwners, ownerNameOfLocation } from '~/lib/finance/entity/entity-owner'
import { addDays } from '~/lib/format/date'
import type { Id, IsoDate, MetricMeta, Money } from '~/lib/core/types'
import { type AppContextFilter, buildMetricMeta, getCachedCoaTree, getCachedEntities } from '~/server/context'
import { loadResolvedBaskets } from '~/server/services/shared/resolved-baskets'
import { computeCashPosition } from '~/server/services/cash/cash-position.service'
import {
  agingCreditData,
  agingDueTotals,
  apOpenInvoices,
  arDirectReturns,
  arOpenInvoices,
  type ArDirectReturnRow,
} from '~/server/repo/ap-ar/aging.repo'
import { listActivePlanStatuses } from '~/server/repo/ap-ar/payment-plan.repo'
import { listVendors } from '~/server/repo/ap-ar/party.repo'
import { unsettledByChannel, settlementLag } from '~/server/repo/cash/bank-payment.repo'
import { invoicesByPlanStatus, planStatus, voucherStatusesByInvoice } from '~/lib/finance/ap-ar/aging'
import {
  applyCreditData,
  applyCreditsToItems,
  balanceAfterCredits,
  partyItemOf,
  reductionsByInvoice,
  subtractReductions,
  type PartyItem,
} from '~/lib/finance/ap-ar/payment-plan-credits'
import {
  buildPaymentPlan,
  type ApItemForPlan,
  type ArItemForPlan,
  type PaymentPlanDay,
  type UnsettledBankForPlan,
} from '~/lib/finance/ap-ar/payment-plan'
import { apItemsFromDueTotals, arItemsFromDueTotals } from '~/lib/finance/ap-ar/payment-plan-aggregate'

export type { PaymentPlanBill }

export type PaymentPlanResult = {
  meta: MetricMeta
  openingBalance: Money
  overdue: Money
  days: PaymentPlanDay[]
  bills: PaymentPlanBill[]
  /** Total of the vendor credits that were taken off the bills in the plan (a positive amount) */
  creditsApplied: Money
  /** Customer credits taken off the projected receipts (a positive amount); 0.00 when receipts are not asked for */
  inflowCreditsApplied: Money
  /** True when at least one bill has a live Pengakuan Biaya document (Posted, Partialy Paid or Not Posted). */
  planStatusInUse: boolean
}

export type PaymentPlanOptions = {
  horizon: '7' | '14' | '30'
  inflow: boolean
}

export function computePaymentPlan(filter: AppContextFilter, opts: PaymentPlanOptions): Promise<PaymentPlanResult> {
  return memoMetric('paymentPlan', { filter, opts }, () => computePaymentPlanUncached(filter, opts))
}

/** An AR direct return as a credit item: it has no due date, so its own date stands in. */
const directReturnCredit = (r: ArDirectReturnRow): PartyItem => ({
  invoiceId: r.cardId,
  partyId: r.customerId,
  locationId: r.locationId,
  dueDate: r.txDate,
  balance: r.balance,
})

type Inflows = {
  arItems: ArItemForPlan[]
  unsettled: UnsettledBankForPlan[]
  settlementLags: Map<Id, number>
  creditsApplied: Money
}

type BankInflows = {
  unsettled: UnsettledBankForPlan[]
  settlementLags: Map<Id, number>
}

/** Money still in a settlement channel, and each channel's usual settlement lag. */
async function loadBankInflows(filter: AppContextFilter): Promise<BankInflows> {
  const tree = await getCachedCoaTree()
  const resolved = await loadResolvedBaskets(tree)
  const inTransitIds = resolved.inTransit
  if (inTransitIds.length === 0) return { unsettled: [], settlementLags: new Map() }

  const [unsettledRows, lagRows] = await Promise.all([
    unsettledByChannel(filter.today, inTransitIds, filter.segmentDetailIds, filter.entitySegmentColumn),
    settlementLag(filter.today, inTransitIds),
  ])
  return {
    unsettled: unsettledRows.map((u) => ({
      coaId: u.coaId,
      txDate: u.txDate,
      amount: u.amount,
    })),
    settlementLags: new Map(lagRows.map((l) => [l.coaId, l.avgLag])),
  }
}

/** Expected inflows: open AR invoices, and the receipts still in a settlement channel with that channel's usual lag. */
async function loadInflows(filter: AppContextFilter, asOfPlusOne: string, lastDay: string): Promise<Inflows> {
  const [rawAr, directReturns, bank] = await Promise.all([
    arOpenInvoices(asOfPlusOne, filter.locationIds),
    arDirectReturns(asOfPlusOne, filter.locationIds),
    loadBankInflows(filter),
  ])
  const { reductions, applied } = applyCreditsToItems({
    items: rawAr.map((a) => partyItemOf(a, a.customerId)),
    extraCredits: directReturns.map(directReturnCredit),
    minDue: filter.today,
    maxDue: lastDay,
  })
  const reducedBy = reductionsByInvoice(reductions)
  return {
    arItems: rawAr
      .filter((a) => D(a.balance).gt(0))
      .map((a) => ({
        dueDate: a.dueDate || a.txDate,
        balance: balanceAfterCredits(a.balance, reducedBy.get(a.invoiceId)),
      })),
    unsettled: bank.unsettled,
    settlementLags: bank.settlementLags,
    creditsApplied: applied,
  }
}

/** The same inflows with the receivables summed per due date by the database (only dates the plan can use). */
async function loadInflowTotals(filter: AppContextFilter, lastDay: string): Promise<Inflows> {
  const [arTotals, bank, credit] = await Promise.all([
    agingDueTotals('ar', filter.today, filter.locationIds, {
      minDue: filter.today,
      maxDue: lastDay,
    }),
    loadBankInflows(filter),
    agingCreditData('ar', filter.today, filter.locationIds, lastDay, {
      minDue: filter.today,
      includeUnallocated: true,
    }),
  ])
  // Neither the snapshot nor a month-end history covers today: read the invoices as before.
  if (arTotals === null) return loadInflows(filter, addDays(filter.today, 1), lastDay)

  const { reductions, applied } = applyCreditData(credit)
  const reduced = subtractReductions(
    { total: arTotals, approved: new Map(), submitted: new Map() },
    reductions,
    () => 'notSubmitted',
  )
  return {
    arItems: arItemsFromDueTotals(reduced.total),
    unsettled: bank.unsettled,
    settlementLags: bank.settlementLags,
    creditsApplied: applied,
  }
}

/** No expected receipts: used when the plan is asked without inflows. */
function noInflows(): Inflows {
  return { arItems: [], unsettled: [], settlementLags: new Map<Id, number>(), creditsApplied: '0.00' }
}

/** The number of days of the plan and the last day it covers (overdue bills are always included). */
function planWindowOf(today: IsoDate, opts: PaymentPlanOptions): { horizon: number; lastDay: IsoDate } {
  const horizon = Number(opts.horizon)
  return { horizon, lastDay: addDays(today, horizon - 1) }
}

/**
 * The part of the result that both entry points build the same way: the projection and the totals around it. They differ
 * only in how the AP and AR items were read (invoice by invoice, or summed per due date by the database).
 */
function assemblePlan(input: {
  meta: MetricMeta
  filter: AppContextFilter
  horizon: number
  inflow: boolean
  openingCash: Money
  apItems: ApItemForPlan[]
  inflows: Inflows
  creditsApplied: Money
  planStatusInUse: boolean
}): PaymentPlanSummaryResult {
  const { filter, inflows } = input
  const res = buildPaymentPlan({
    today: filter.today,
    horizon: input.horizon,
    inflow: input.inflow,
    openingCash: input.openingCash,
    apItems: input.apItems,
    arItems: inflows.arItems,
    unsettled: inflows.unsettled,
    settlementLags: inflows.settlementLags,
  })
  return {
    meta: input.meta,
    openingBalance: res.openingBalance,
    overdue: res.overdue,
    days: res.days,
    creditsApplied: input.creditsApplied,
    inflowCreditsApplied: inflows.creditsApplied,
    planStatusInUse: input.planStatusInUse,
  }
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
  const { horizon, lastDay } = planWindowOf(today, opts)
  // Bills due after the horizon change nothing in the plan, so they are left out here.
  const apPositive = rawAp.filter((a) => D(a.balance).gt(0) && (a.dueDate || a.txDate) <= lastDay)

  const statusMap = voucherStatusesByInvoice(statusRows)

  // Vendor credits reduce the bills of the same vendor and entity, earliest due date first (decisions D53).
  const { reductions, applied: creditsApplied } = applyCreditsToItems({
    items: rawAp.map((a) => partyItemOf(a, a.vendorId)),
    maxDue: lastDay,
  })
  const reducedBy = reductionsByInvoice(reductions)

  const apItems: ApItemForPlan[] = apPositive.map((a) => ({
    invoiceId: a.invoiceId,
    dueDate: a.dueDate || a.txDate,
    balance: balanceAfterCredits(a.balance, reducedBy.get(a.invoiceId)),
    status: planStatus(statusMap.get(a.invoiceId) ?? []),
  }))

  // 4. Inflows (AR + bank payments unsettled)
  const inflows = opts.inflow ? await loadInflows(filter, asOfPlusOne, lastDay) : noInflows()

  // 5. Projection
  const plan = assemblePlan({
    meta,
    filter,
    horizon,
    inflow: opts.inflow,
    openingCash,
    apItems,
    inflows,
    creditsApplied,
    planStatusInUse: statusRows.length > 0,
  })

  // 6. Bills due in horizon (apPositive already holds only those, overdue included)
  const horizonBills = apPositive
  const vendorIds = Array.from(new Set(horizonBills.map((b) => b.vendorId)))
  const [vendorList, { entities }] = await Promise.all([listVendors(vendorIds), getCachedEntities()])
  const owners = buildEntityOwners(entities)
  const vendorMap = new Map(vendorList.map((v) => [v.vendorId, v.name]))

  const bills: PaymentPlanBill[] = horizonBills.map((b) => ({
    invoiceId: b.invoiceId,
    vendorId: b.vendorId,
    vendorName: vendorMap.get(b.vendorId) || b.vendorId,
    entityName: ownerNameOfLocation(owners, b.locationId),
    invoiceNumber: b.invoiceNumber || b.invoiceId,
    dueDate: b.dueDate || b.txDate,
    balance: b.balance,
    status: planStatus(statusMap.get(b.invoiceId) ?? []),
    overdue: (b.dueDate || b.txDate) < today,
    kind: 'bill',
  }))

  const creditRows: PaymentPlanBill[] = reductions.map((r) => ({
    invoiceId: `credit:${r.invoiceId}`,
    vendorId: r.partyId,
    vendorName: vendorMap.get(r.partyId) || r.partyId,
    entityName: ownerNameOfLocation(owners, r.locationId),
    invoiceNumber: '',
    dueDate: r.dueDate,
    balance: D(r.amount).negated().toFixed(2),
    status: planStatus(statusMap.get(r.invoiceId) ?? []),
    overdue: r.dueDate < today,
    kind: 'credit',
  }))

  return { ...plan, bills: [...bills, ...creditRows] }
}

export type PaymentPlanSummaryResult = Omit<PaymentPlanResult, 'bills'>

/**
 * The plan without its list of bills (what the Payment Plan page shows): the totals per due date and per voucher
 * status are summed by the database from the snapshot, so no list of invoices is loaded. Falls back to the
 * per-invoice plan when the snapshot cannot answer for today.
 */
export function computePaymentPlanSummary(
  filter: AppContextFilter,
  opts: PaymentPlanOptions,
): Promise<PaymentPlanSummaryResult> {
  return memoMetric('paymentPlanSummary', { filter, opts }, () => computePaymentPlanSummaryUncached(filter, opts))
}

async function computePaymentPlanSummaryUncached(
  filter: AppContextFilter,
  opts: PaymentPlanOptions,
): Promise<PaymentPlanSummaryResult> {
  const meta = buildMetricMeta(filter)
  const today = filter.today
  const { horizon, lastDay } = planWindowOf(today, opts)

  // Opening cash, the bills due by the last day of the plan (overdue included), the live payment vouchers and the vendor
  // credits are independent. The credit read answers null, without a query, when the snapshot does not cover today.
  const [cashPos, statusRows, apTotals, credit] = await Promise.all([
    computeCashPosition({ ...filter, asOf: today }, { includeByEntity: false, includeCompare: false }),
    listActivePlanStatuses(),
    agingDueTotals('ap', today, filter.locationIds, { maxDue: lastDay }),
    agingCreditData('ap', today, filter.locationIds, lastDay),
  ])

  if (apTotals === null) {
    const { bills: _bills, ...summary } = await computePaymentPlan(filter, opts)
    return summary
  }

  // A bill with a live voucher is "approved" or "submitted" (the rule of planStatus); every other bill is "not submitted".
  const statusMap = voucherStatusesByInvoice(statusRows)
  const { approved: approvedIds, submitted: submittedIds } = invoicesByPlanStatus(statusMap)
  const [approved, submitted] = await Promise.all([
    agingDueTotals('ap', today, filter.locationIds, {
      maxDue: lastDay,
      invoiceIds: approvedIds,
    }),
    agingDueTotals('ap', today, filter.locationIds, {
      maxDue: lastDay,
      invoiceIds: submittedIds,
    }),
  ])
  const { reductions, applied: creditsApplied } = applyCreditData(credit)
  const reduced = subtractReductions(
    { total: apTotals, approved: approved ?? new Map(), submitted: submitted ?? new Map() },
    reductions,
    (invoiceId) => planStatus(statusMap.get(invoiceId) ?? []),
  )
  const apItems = apItemsFromDueTotals(reduced)

  const inflows = opts.inflow ? await loadInflowTotals(filter, lastDay) : noInflows()

  return assemblePlan({
    meta,
    filter,
    horizon,
    inflow: opts.inflow,
    openingCash: cashPos.cashPosition,
    apItems,
    inflows,
    creditsApplied,
    planStatusInUse: statusRows.length > 0,
  })
}

export type BillsPage = Page<PaymentPlanBill> & {
  /** Count and total of both tabs, whichever tab is shown. */
  scopes: BillScopeSummary
  /** True when more than one entity is in scope: the table then names the entity of every bill. */
  showEntity: boolean
  /** False when no bill has a live Pengakuan Biaya document: the status column then says nothing. */
  planStatusInUse: boolean
}

const billComparators: Record<string, Comparator<PaymentPlanBill>> = paymentBillComparators

// A plan can hold 100k+ bills and the table asks for a page (or an export chunk) at a time. Sorting and summing the
// whole list on every request is the expensive part, so each (tab, sort) view and the tab totals are built once per plan.
const sortedBills = createViewCache<PaymentPlanBill>()
const scopeTotals = createViewCache<PaymentPlanBill, BillScopeSummary>()

/** One sorted page of the bills of one tab (the plan itself is memoized, so paging does not re-query). */
export async function listPaymentPlanBills(
  filter: AppContextFilter,
  opts: PaymentPlanOptions,
  query: TableQuery,
  scope: BillScope,
): Promise<BillsPage> {
  const plan = await computePaymentPlan(filter, opts)
  const compare = query.sortBy ? billComparators[query.sortBy] : undefined
  const sortKey = compare ? `${query.sortBy}|${query.sortDir}` : ''
  const sorted = sortedBills(plan.bills, `${scope}|${sortKey}`, () => {
    const inScope = filterBillsByScope(plan.bills, scope)
    return compare ? sortRows(inScope, compare, query.sortDir) : inScope
  })
  return {
    ...pageOfSorted(sorted, query),
    scopes: scopeTotals(plan.bills, 'scopes', () => summarizeBillScopes(plan.bills)),
    planStatusInUse: plan.planStatusInUse,
    showEntity: filter.entityCount > 1,
  }
}
