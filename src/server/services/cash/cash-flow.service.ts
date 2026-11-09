import '@tanstack/react-start/server-only'
import { activePeriodsOf } from '~/lib/filters/filter-scope'
import Decimal from 'decimal.js'
import { D, sum } from '~/lib/core/money'
import { addDays } from '~/lib/format/date'
import type { Id, MetricMeta, Money, Period } from '~/lib/core/types'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'
import { type AppContextFilter, buildMetricMeta, getCachedCoaTree, getCachedPeriods } from '~/server/context'
import { memoMetric } from '~/server/cache'
import { loadResolvedBaskets } from '~/server/services/shared/resolved-baskets'
import { allCashAccountIds } from '~/lib/finance/coa/basket-resolver'
import { balancesAt } from '~/server/services/cash/balance.service'
import { linesOfCashJournals, getCashFlowSetup } from '~/server/repo/cash/cashflow.repo'
import { UNCLASSIFIED_SUBGROUP } from '~/lib/finance/cash/cashflow-labels'
import {
  allocateCash,
  settledJournals,
  makeIsOurCash,
  classifyCounterAmount,
  counterAccountOf,
  isSetupValid,
  type DrawerKey,
  type CfLine,
  type SettledJournal,
  type CfSetupRow,
} from '~/lib/finance/cash/cashflow'

export type CashFlowResult = {
  meta: MetricMeta
  source: 'setup' | 'fallback'
  openingCash: Money
  drawers: Array<{
    drawer: DrawerKey
    total: Money
    rows: Array<{ subGroup: string; amount: Money; unclassified?: boolean }>
  }>
  netCashFlow: Money
  closingCash: Money
  closingCashByBalance: Money
  identityOk: boolean
  monthly: Array<{ month: string; cashIn: Money; cashOut: Money; net: Money }>
  erpComparison: Array<{
    drawer: string
    dashboard: Money
    erpMethod: Money
    diff: Money
  }>
}

export type ClassifiedCashPortion = {
  glId: Id
  journalType: number
  periodId: Id
  counterCoaId: Id
  portion: Money
  drawer: DrawerKey
  subGroup: string
  unclassified?: boolean
}

export { UNCLASSIFIED_SUBGROUP }

/**
 * Loads the cash journals of the selected periods, allocates cash proportionally to the
 * counter lines and classifies every portion (data-model §6.3). Shared by the Cash Flow
 * metric and its drill-down so both always show the same numbers.
 */
export type ClassifiedPortions = {
  lines: CfLine[]
  portions: ClassifiedCashPortion[]
  setupValid: boolean
  setup: CfSetupRow[]
  cashEquivIds: Id[]
  isOurCash: (l: CfLine) => boolean
}

/** Memoized: the drill-down asks for the same portions on every click and every page. */
export function loadClassifiedPortions(
  filter: AppContextFilter,
  ctx?: LoadPortionsContext,
): Promise<ClassifiedPortions> {
  return memoMetric(
    'cashPortions',
    { filter, cashEquivIds: ctx?.cashEquivIds ? [...ctx.cashEquivIds].sort() : null },
    () => loadClassifiedPortionsUncached(filter, ctx),
  )
}

type LoadPortionsContext = {
  tree?: CoaTree
  periods?: Period[]
  /** Accounts that count as "our cash" (default: cash ∪ bank ∪ deposit). */
  cashEquivIds?: Id[]
}

async function loadClassifiedPortionsUncached(
  filter: AppContextFilter,
  ctx?: LoadPortionsContext,
): Promise<ClassifiedPortions> {
  const tree = ctx?.tree ?? (await getCachedCoaTree())
  const periods = ctx?.periods ?? (await getCachedPeriods())
  // Lines are always read for the widest cash list, so Cash Flow, Expense Paid and the drill-downs share one read for
  // the same periods (Runway reads the three months before the report date, so it shares only when the periods match);
  // `cashEquivIds` only decides which of those lines count as our cash.
  const resolved = await loadResolvedBaskets(tree)
  const fetchIds = allCashAccountIds(resolved)
  const cashEquivIds = ctx?.cashEquivIds ?? fetchIds
  const isOurCash = makeIsOurCash(cashEquivIds, filter.segmentDetailIds)

  const setup = await getCashFlowSetup()
  const setupValid = isSetupValid(setup)

  const activePeriods = activePeriodsOf(periods, filter.periodIds)
  if (cashEquivIds.length === 0 || activePeriods.length === 0) {
    return { lines: [], portions: [], setupValid, setup, cashEquivIds, isOurCash }
  }

  const lines: CfLine[] = await linesOfCashJournals({
    periods: activePeriods,
    segCol: filter.entitySegmentColumn,
    segIds: filter.segmentDetailIds,
    cashCoaIds: fetchIds,
  })

  const portions: ClassifiedCashPortion[] = allocateCash(lines, isOurCash).map((p) => ({
    ...p,
    ...classifyCounterAmount(p.portion, counterAccountOf(tree, p.counterCoaId), p.journalType, setupValid, setup),
  }))

  return { lines, portions, setupValid, setup, cashEquivIds, isOurCash }
}

const DRAWERS = ['OPERATING', 'INVESTING', 'FUNDING'] as const

function emptyCashFlow(meta: MetricMeta, months: string[]): CashFlowResult {
  return {
    meta,
    source: 'fallback',
    openingCash: '0.00',
    drawers: DRAWERS.map((drawer) => ({ drawer, total: '0.00', rows: [] })),
    netCashFlow: '0.00',
    closingCash: '0.00',
    closingCashByBalance: '0.00',
    identityOk: true,
    monthly: months.map((month) => ({ month, cashIn: '0.00', cashOut: '0.00', net: '0.00' })),
    erpComparison: DRAWERS.map((drawer) => ({ drawer, dashboard: '0.00', erpMethod: '0.00', diff: '0.00' })),
  }
}

function summarizeDrawers(portions: ClassifiedCashPortion[]): {
  drawers: CashFlowResult['drawers']
  netCashFlow: Decimal
} {
  type RowItem = { subGroup: string; amount: Decimal; unclassified?: boolean }
  const rowsByDrawer: Record<DrawerKey, Map<string, RowItem>> = {
    OPERATING: new Map(),
    INVESTING: new Map(),
    FUNDING: new Map(),
  }

  let netCashFlow = D(0)
  for (const p of portions) {
    const pDec = D(p.portion)
    netCashFlow = netCashFlow.plus(pDec)

    const drawerMap = rowsByDrawer[p.drawer]
    const existing = drawerMap.get(p.subGroup) ?? {
      subGroup: p.subGroup,
      amount: D(0),
      unclassified: p.unclassified,
    }
    existing.amount = existing.amount.plus(pDec)
    drawerMap.set(p.subGroup, existing)
  }

  const drawers = DRAWERS.map((drawer) => {
    let total = D(0)
    const rows = Array.from(rowsByDrawer[drawer].values()).map((r) => {
      total = total.plus(r.amount)
      return { subGroup: r.subGroup, amount: r.amount.toFixed(2), unclassified: r.unclassified }
    })
    return { drawer, total: total.toFixed(2), rows }
  })

  return { drawers, netCashFlow }
}

/** Cash in / out per month, one entry per journal that moves our cash. */
function monthlyTrend(journals: SettledJournal[], periods: Period[], months: string[]): CashFlowResult['monthly'] {
  const periodById = new Map(periods.map((p) => [p.periodeId, p]))
  const totals = new Map<string, { cashIn: Decimal; cashOut: Decimal }>(
    months.map((m) => [m, { cashIn: D(0), cashOut: D(0) }]),
  )

  for (const j of journals) {
    const period = periodById.get(j.ourCash[0]!.periodId)
    const total = totals.get(period ? period.startDate.slice(0, 7) : '')
    if (!total) continue
    if (j.netCash.gt(0)) total.cashIn = total.cashIn.plus(j.netCash)
    else total.cashOut = total.cashOut.plus(j.netCash.abs())
  }

  return months.map((month) => {
    const m = totals.get(month) ?? { cashIn: D(0), cashOut: D(0) }
    return {
      month,
      cashIn: m.cashIn.toFixed(2),
      cashOut: m.cashOut.toFixed(2),
      net: m.cashIn.minus(m.cashOut).toFixed(2),
    }
  })
}

/** ERP method: sums the full counter lines without proportional allocation. */
function erpMethodTotals(
  journals: SettledJournal[],
  tree: CoaTree,
  setupValid: boolean,
  setup: CfSetupRow[],
): Record<DrawerKey, Decimal> {
  const totals: Record<DrawerKey, Decimal> = { OPERATING: D(0), INVESTING: D(0), FUNDING: D(0) }

  for (const j of journals) {
    for (const cl of j.counterLines) {
      // Counter line net movement
      const clNet = D(cl.credit).minus(D(cl.debet))
      const classified = classifyCounterAmount(
        clNet.toFixed(2),
        counterAccountOf(tree, cl.coaId),
        cl.journalType,
        setupValid,
        setup,
      )
      // Amounts the ERP method cannot place are left out of its totals.
      if (!classified.unclassified) totals[classified.drawer] = totals[classified.drawer].plus(clNet)
    }
  }
  return totals
}

export function computeCashFlow(filter: AppContextFilter): Promise<CashFlowResult> {
  return memoMetric('cashFlow', filter, () => computeCashFlowUncached(filter))
}

async function computeCashFlowUncached(filter: AppContextFilter): Promise<CashFlowResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()
  const resolved = await loadResolvedBaskets(tree)

  // Cash and cash equivalents = cash ∪ bank ∪ deposit (D27)
  const cashEquivIds = allCashAccountIds(resolved)

  if (cashEquivIds.length === 0 || filter.periodIds.length === 0) {
    return emptyCashFlow(meta, filter.months)
  }

  // Opening cash = balance the day before d1; closing = balance at asOf; plus the cash journal lines.
  const [opRes, clRes, classified] = await Promise.all([
    balancesAt({ asOf: addDays(filter.d1, -1), coaIds: cashEquivIds, filter }),
    balancesAt({ asOf: filter.asOf, coaIds: cashEquivIds, filter }),
    loadClassifiedPortions(filter, { tree, periods }),
  ])
  const { lines, portions, setupValid, setup, isOurCash } = classified

  const openingCash = sum(cashEquivIds.map((id) => opRes.byCoa.get(id) ?? '0.00'))
  const closingCashByBalance = sum(cashEquivIds.map((id) => clRes.byCoa.get(id) ?? '0.00'))

  const { drawers, netCashFlow: netCashFlowDec } = summarizeDrawers(portions)
  const closingCash = D(openingCash).plus(netCashFlowDec).toFixed(2)

  const journals = settledJournals(lines, isOurCash)
  const erpTotals = erpMethodTotals(journals, tree, setupValid, setup)

  const erpComparison = DRAWERS.map((drawer) => {
    const dashboard = drawers.find((d) => d.drawer === drawer)?.total ?? '0.00'
    const erpMethod = erpTotals[drawer].toFixed(2)
    return { drawer, dashboard, erpMethod, diff: D(dashboard).minus(D(erpMethod)).toFixed(2) }
  })

  return {
    meta,
    source: setupValid ? 'setup' : 'fallback',
    openingCash,
    drawers,
    netCashFlow: netCashFlowDec.toFixed(2),
    closingCash,
    closingCashByBalance,
    identityOk: closingCash === closingCashByBalance,
    monthly: monthlyTrend(journals, periods, filter.months),
    erpComparison,
  }
}
