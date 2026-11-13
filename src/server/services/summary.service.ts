import '@tanstack/react-start/server-only'
import type { Breakdown, MetricMeta, Money } from '~/lib/core/types'
import { type AppContextFilter, buildMetricMeta } from '~/server/context'
import { computeCashPosition, type CashPositionResult } from '~/server/services/cash/cash-position.service'
import { computeRevenue, type RevenueResult } from '~/server/services/pnl/revenue.service'
import { computePnl } from '~/server/services/pnl/pnl.service'
import { computeApAging, type ApAgingResult } from '~/server/services/ap-ar/ap-aging.service'
import { computeCashFlow, type CashFlowResult } from '~/server/services/cash/cash-flow.service'
import { computeRunwayMetrics, type RunwayResult } from '~/server/services/cash/runway.service'
import { computePaymentPlan } from '~/server/services/ap-ar/payment-plan.service'
import { computeFixedCost } from '~/server/services/pnl/fixed-cost.service'
import { buildOperatingExpenseFolders, type OperatingExpenseFolder } from '~/lib/finance/pnl/operating-expense'

export type SummaryResult = {
  meta: MetricMeta
  cashPosition: {
    total: Money
    compare: Money | null
    cash: Money
    bank: Money
    deposit: Money
    inTransit: Money
    giroOutstanding: Money
    entityCount?: number
  }
  revenue: {
    total: Money
    compare: Money | null
    trend: Array<{ month: string; amount: Money }>
    byFolder: Breakdown[]
    byEntity: RevenueResult['byEntity']
    entityUnassigned: Money
  }
  /** Cost Of Sales and Expense folders: the slices of the Expense tab of the Composition donut (Other Expense is not included, D42). */
  expenseFolders: OperatingExpenseFolder[]
  /** Folders of the Fixed Cost basket: the slices of the Fixed Cost tab. */
  fixedCostFolders: Breakdown[]
  /** True when the Fixed Cost basket is empty in Settings: the Fixed Cost tab is hidden. */
  fixedCostBasketEmpty: boolean
  pnl: {
    grossProfit: Money
    grossMargin: string | null
    operatingProfit: Money
    operatingMargin: string | null
    netProfit: Money
    netMargin: string | null
  }
  apAging: {
    total: Money
    unpaidBills: Money
    overdueSubtotal: Money
    overdueBills: Money
  }
  cashFlow: {
    netCashFlow: Money
    closingCash: Money
    monthly: Array<{ month: string; cashIn: Money; cashOut: Money; net: Money }>
  }
  runway: {
    runwayMonths: string | null
    cashFlowPositive: boolean
    avgBurn: Money
    currentRatio: string | null
  }
  paymentPlan7Days: {
    openingBalance: Money
    overdue: Money
    days: Array<{
      date: string
      outflow: Money
      closing: Money
      isNegative: boolean
    }>
  }
}

// The cards below are built in more than one place (the whole summary and the parts of the page). One function per card
// keeps the parts carrying the same figures.

function cashPositionCard(cashPos: CashPositionResult, filter: AppContextFilter): SummaryResult['cashPosition'] {
  return {
    total: cashPos.cashPosition,
    compare: cashPos.compare.cashPosition,
    cash: cashPos.cash,
    bank: cashPos.bank,
    deposit: cashPos.deposit,
    inTransit: cashPos.inTransit,
    giroOutstanding: cashPos.giroOutstanding,
    entityCount: filter.entityCount,
  }
}

function apAgingCard(apAging: ApAgingResult): SummaryResult['apAging'] {
  return {
    total: apAging.total,
    unpaidBills: apAging.unpaidBills,
    overdueSubtotal: apAging.overdueSubtotal,
    overdueBills: apAging.overdueBills,
  }
}

function cashFlowCard(cashFlow: CashFlowResult): SummaryResult['cashFlow'] {
  return { netCashFlow: cashFlow.netCashFlow, closingCash: cashFlow.closingCash, monthly: cashFlow.monthly }
}

function runwayCard(runway: RunwayResult): SummaryResult['runway'] {
  return {
    runwayMonths: runway.runwayMonths,
    cashFlowPositive: runway.cashFlowPositive,
    avgBurn: runway.avgBurn,
    currentRatio: runway.currentRatio,
  }
}

/**
 * The whole Summary page in one result. The page itself loads it in three parts (head, charts and mini, further down),
 * so only the integration tests use this function: they check that the three parts carry the same figures.
 */
export async function computeSummary(filter: AppContextFilter): Promise<SummaryResult> {
  const meta = buildMetricMeta(filter)

  const [cashPos, revenue, pnl, apAging, cashFlow, runway, paymentPlan, fixedCost] = await Promise.all([
    computeCashPosition(filter, { includeByEntity: false }),
    computeRevenue(filter),
    computePnl(filter),
    computeApAging(filter),
    computeCashFlow(filter),
    computeRunwayMetrics(filter),
    computePaymentPlan(filter, { horizon: '7', inflow: false }),
    computeFixedCost(filter),
  ])

  const pnlMap = new Map(pnl.lines.map((l) => [l.key, l]))
  const gpLine = pnlMap.get('grossProfit')
  const opLine = pnlMap.get('operatingProfit')
  const npLine = pnlMap.get('netProfit')

  return {
    meta,
    cashPosition: cashPositionCard(cashPos, filter),
    revenue: {
      total: revenue.total,
      compare: revenue.compareTotal,
      trend: revenue.trend,
      byFolder: revenue.byFolder,
      byEntity: revenue.byEntity,
      entityUnassigned: revenue.entityUnassigned,
    },
    expenseFolders: buildOperatingExpenseFolders(pnl.lines),
    fixedCostFolders: fixedCost.byFolder,
    fixedCostBasketEmpty: fixedCost.basketEmpty,
    pnl: {
      grossProfit: gpLine?.amount ?? '0.00',
      grossMargin: gpLine?.margin ?? null,
      operatingProfit: opLine?.amount ?? '0.00',
      operatingMargin: opLine?.margin ?? null,
      netProfit: npLine?.amount ?? '0.00',
      netMargin: npLine?.margin ?? null,
    },
    apAging: apAgingCard(apAging),
    cashFlow: cashFlowCard(cashFlow),
    runway: runwayCard(runway),
    paymentPlan7Days: {
      openingBalance: paymentPlan.openingBalance,
      overdue: paymentPlan.overdue,
      days: paymentPlan.days.map((d) => ({
        date: d.date,
        outflow: d.outflow,
        closing: d.closing,
        isNegative: d.isNegative,
      })),
    },
  }
}

// ---------------------------------------------------------------------------
// The Summary page loads in three parts so the quick top row does not wait for the slow ones.
// The parts share metrics (P&L, revenue): memoMetric makes them compute once, whichever part asks first.
// ---------------------------------------------------------------------------

/** The four cards at the top: cash position, revenue, net profit and payables. */
export type SummaryHead = {
  meta: MetricMeta
  cashPosition: SummaryResult['cashPosition']
  revenue: { total: Money; compare: Money | null }
  pnl: { netProfit: Money; netMargin: string | null }
  apAging: SummaryResult['apAging']
}

export async function computeSummaryHead(filter: AppContextFilter): Promise<SummaryHead> {
  const meta = buildMetricMeta(filter)
  const [cashPos, revenue, pnl, apAging] = await Promise.all([
    computeCashPosition(filter, { includeByEntity: false }),
    computeRevenue(filter),
    computePnl(filter),
    computeApAging(filter),
  ])
  const netProfit = pnl.lines.find((l) => l.key === 'netProfit')
  return {
    meta,
    cashPosition: cashPositionCard(cashPos, filter),
    revenue: { total: revenue.total, compare: revenue.compareTotal },
    pnl: { netProfit: netProfit?.amount ?? '0.00', netMargin: netProfit?.margin ?? null },
    apAging: apAgingCard(apAging),
  }
}

/** The cash flow chart and the Composition / Revenue by Entity donuts. */
export type SummaryCharts = {
  cashFlow: SummaryResult['cashFlow']
  revenueByFolder: Breakdown[]
  revenueByEntity: RevenueResult['byEntity']
  entityUnassigned: Money
  expenseFolders: OperatingExpenseFolder[]
  fixedCostFolders: Breakdown[]
  fixedCostBasketEmpty: boolean
}

export async function computeSummaryCharts(filter: AppContextFilter): Promise<SummaryCharts> {
  const [revenue, pnl, cashFlow, fixedCost] = await Promise.all([
    computeRevenue(filter),
    computePnl(filter),
    computeCashFlow(filter),
    computeFixedCost(filter),
  ])
  return {
    cashFlow: cashFlowCard(cashFlow),
    revenueByFolder: revenue.byFolder,
    revenueByEntity: revenue.byEntity,
    entityUnassigned: revenue.entityUnassigned,
    expenseFolders: buildOperatingExpenseFolders(pnl.lines),
    fixedCostFolders: fixedCost.byFolder,
    fixedCostBasketEmpty: fixedCost.basketEmpty,
  }
}

/** Runway, gross margin, net margin and current ratio. */
export type SummaryMini = {
  runway: SummaryResult['runway']
  grossMargin: string | null
  netMargin: string | null
}

export async function computeSummaryMini(filter: AppContextFilter): Promise<SummaryMini> {
  const [runway, pnl] = await Promise.all([computeRunwayMetrics(filter), computePnl(filter)])
  const line = (key: string) => pnl.lines.find((l) => l.key === key)
  return {
    runway: runwayCard(runway),
    grossMargin: line('grossProfit')?.margin ?? null,
    netMargin: line('netProfit')?.margin ?? null,
  }
}
