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
import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D } from '~/lib/core/money'
import { buildEntityOwners, ownerNameOfLocation } from '~/lib/finance/entity/entity-owner'
import { addDays } from '~/lib/format/date'
import type { Id, MetricMeta, Money } from '~/lib/core/types'
import { type AppContextFilter, buildMetricMeta, getCachedCoaTree, getCachedEntities } from '~/server/context'
import { loadResolvedBaskets } from '~/server/services/shared/resolved-baskets'
import { computeCashPosition } from '~/server/services/cash/cash-position.service'
import { agingCreditData, agingDueTotals, apOpenInvoices, arDirectReturns, arOpenInvoices } from '~/server/repo/ap-ar/aging.repo'
import { listActivePlanStatuses } from '~/server/repo/ap-ar/payment-plan.repo'
import { listVendors } from '~/server/repo/ap-ar/party.repo'
import { unsettledByChannel, settlementLag } from '~/server/repo/cash/bank-payment.repo'
import { invoicesByPlanStatus, planStatus, voucherStatusesByInvoice } from '~/lib/finance/ap-ar/aging'
import {
  applyCredits,
  creditPoolsFromItems,
  subtractReductions,
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
  const pools = creditPoolsFromItems([
    ...rawAr.map((a) => ({ partyId: a.customerId, locationId: a.locationId, balance: a.balance })),
    ...directReturns.map((r) => ({ partyId: r.customerId, locationId: r.locationId, balance: r.balance })),
  ])
  const inWindow = rawAr.filter((a) => {
    const due = a.dueDate || a.txDate
    return D(a.balance).gt(0) && due >= filter.today && due <= lastDay
  })
  const { reductions, applied } = applyCredits(
    inWindow.map((a) => ({
      invoiceId: a.invoiceId,
      partyId: a.customerId,
      locationId: a.locationId,
      dueDate: a.dueDate || a.txDate,
      balance: a.balance,
    })),
    pools,
  )
  const reducedBy = new Map<Id, Decimal>()
  for (const r of reductions) reducedBy.set(r.invoiceId, (reducedBy.get(r.invoiceId) ?? D(0)).plus(D(r.amount)))
  return {
    arItems: rawAr
      .filter((a) => D(a.balance).gt(0))
      .map((a) => ({
        dueDate: a.dueDate || a.txDate,
        balance: D(a.balance).minus(reducedBy.get(a.invoiceId) ?? D(0)).toFixed(2),
      })),
    unsettled: bank.unsettled,
    settlementLags: bank.settlementLags,
    creditsApplied: applied,
  }
}

/** The same inflows with the receivables summed per due date by the database (only dates the plan can use). */
async function loadInflowTotals(filter: AppContextFilter, lastDay: string): Promise<Inflows> {
  const [arTotals, bank] = await Promise.all([
    agingDueTotals('ar', filter.today, filter.locationIds, {
      minDue: filter.today,
      maxDue: lastDay,
    }),
    loadBankInflows(filter),
  ])
  // Neither the snapshot nor a month-end history covers today: read the invoices as before.
  if (arTotals === null) return loadInflows(filter, addDays(filter.today, 1), lastDay)

  const credit = await agingCreditData('ar', filter.today, filter.locationIds, lastDay, {
    minDue: filter.today,
    includeUnallocated: true,
  })
  const { reductions, applied } = credit ? applyCredits(credit.bills, credit.pools) : { reductions: [], applied: '0.00' }
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

  const statusMap = voucherStatusesByInvoice(statusRows)

  // Vendor credits reduce the bills of the same vendor and entity, earliest due date first (decisions D53).
  const creditPools = creditPoolsFromItems(
    rawAp.map((a) => ({ partyId: a.vendorId, locationId: a.locationId, balance: a.balance })),
  )
  const { reductions, applied: creditsApplied } = applyCredits(
    apPositive.map((a) => ({
      invoiceId: a.invoiceId,
      partyId: a.vendorId,
      locationId: a.locationId,
      dueDate: a.dueDate || a.txDate,
      balance: a.balance,
    })),
    creditPools,
  )
  const reducedBy = new Map<Id, Decimal>()
  for (const r of reductions) reducedBy.set(r.invoiceId, (reducedBy.get(r.invoiceId) ?? D(0)).plus(D(r.amount)))

  const apItems: ApItemForPlan[] = apPositive.map((a) => ({
    invoiceId: a.invoiceId,
    dueDate: a.dueDate || a.txDate,
    balance: D(a.balance).minus(reducedBy.get(a.invoiceId) ?? D(0)).toFixed(2),
    status: planStatus(statusMap.get(a.invoiceId) ?? []),
  }))

  // 4. Inflows (AR + bank payments unsettled)
  const {
    arItems,
    unsettled,
    settlementLags,
    creditsApplied: inflowCreditsApplied,
  } = opts.inflow
    ? await loadInflows(filter, asOfPlusOne, lastDay)
    : { arItems: [], unsettled: [], settlementLags: new Map<Id, number>(), creditsApplied: '0.00' }

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

  return {
    meta,
    openingBalance: res.openingBalance,
    overdue: res.overdue,
    days: res.days,
    bills: [...bills, ...creditRows],
    creditsApplied,
    inflowCreditsApplied,
    planStatusInUse: statusRows.length > 0,
  }
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
  const horizon = Number(opts.horizon) || 7
  const lastDay = addDays(today, horizon - 1)

  // Opening cash, the bills due by the last day of the plan (overdue included) and the live payment vouchers are independent.
  const [cashPos, statusRows, apTotals] = await Promise.all([
    computeCashPosition({ ...filter, asOf: today }, { includeByEntity: false, includeCompare: false }),
    listActivePlanStatuses(),
    agingDueTotals('ap', today, filter.locationIds, { maxDue: lastDay }),
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
  const credit = await agingCreditData('ap', today, filter.locationIds, lastDay)
  const { reductions, applied: creditsApplied } = credit
    ? applyCredits(credit.bills, credit.pools)
    : { reductions: [], applied: '0.00' }
  const reduced = subtractReductions(
    { total: apTotals, approved: approved ?? new Map(), submitted: submitted ?? new Map() },
    reductions,
    (invoiceId) => planStatus(statusMap.get(invoiceId) ?? []),
  )
  const apItems = apItemsFromDueTotals(reduced)

  const {
    arItems,
    unsettled,
    settlementLags,
    creditsApplied: inflowCreditsApplied,
  } = opts.inflow
    ? await loadInflowTotals(filter, lastDay)
    : { arItems: [], unsettled: [], settlementLags: new Map<Id, number>(), creditsApplied: '0.00' }

  const res = buildPaymentPlan({
    today,
    horizon,
    inflow: opts.inflow,
    openingCash: cashPos.cashPosition,
    apItems,
    arItems,
    unsettled,
    settlementLags,
  })
  return {
    meta,
    openingBalance: res.openingBalance,
    overdue: res.overdue,
    days: res.days,
    creditsApplied,
    inflowCreditsApplied,
    planStatusInUse: statusRows.length > 0,
  }
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
