import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { postableAccountIds } from '~/lib/finance/coa-tree'
import { D, sum } from '~/lib/finance/money'
import type { Id, MetricMeta, Money, Period } from '~/lib/finance/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedPeriods,
} from '~/server/context'
import { memoMetric } from '~/server/cache'
import { loadAccountMapping } from '~/server/services/shared/mapping.helper'
import { resolveBaskets } from '~/lib/finance/basket-resolver'
import { balancesAt } from '~/server/services/balance.service'
import { computeCashPosition } from '~/server/services/cash-position.service'
import { computePnl } from '~/server/services/pnl.service'
import { linesOfCashJournals } from '~/server/repo/cashflow.repo'
import { allocateCash, makeIsOurCash } from '~/lib/finance/cashflow'
import {
  computeAvgBurn,
  computeRunway,
  computeRatios,
} from '~/lib/finance/runway'

export type RunwayResult = {
  meta: MetricMeta
  runwayMonths: string | null
  cashFlowPositive: boolean
  avgBurn: Money
  grossMargin: string | null
  netMargin: string | null
  currentRatio: string | null
}

/** Memoized: Summary, Cash Position and P&L all show the runway, and each asks for it. */
export function computeRunwayMetrics(filter: AppContextFilter): Promise<RunwayResult> {
  return memoMetric('runway', filter, () => computeRunwayMetricsUncached(filter))
}

/** Average net cash movement of the last 3 full months that end before the month of `asOf`. */
async function averageBurn(filter: AppContextFilter, periods: Period[], cashEquivIds: Id[]): Promise<Money> {
  const asOfMonth = filter.asOf.slice(0, 7)
  const priorMonths = Array.from(
    new Set(
      periods
        .filter((p) => p.type === 0 && p.endDate < filter.asOf && p.startDate.slice(0, 7) < asOfMonth)
        .map((p) => p.startDate.slice(0, 7)),
    ),
  ).sort().reverse().slice(0, 3)

  const priorPeriods = periods.filter((p) => priorMonths.includes(p.startDate.slice(0, 7)))
  if (priorMonths.length === 0 || priorPeriods.length === 0 || cashEquivIds.length === 0) return '0.00'

  const priorLines = await linesOfCashJournals({
    periods: priorPeriods,
    segCol: filter.entitySegmentColumn,
    segIds: filter.segmentDetailIds,
    cashCoaIds: cashEquivIds,
  })
  const portions = allocateCash(priorLines, makeIsOurCash(cashEquivIds, filter.segmentDetailIds))

  const periodMonthMap = new Map(priorPeriods.map((p) => [p.periodeId, p.startDate.slice(0, 7)]))
  const monthNetMap = new Map<string, Decimal>(priorMonths.map((m) => [m, D(0)]))
  for (const p of portions) {
    const m = periodMonthMap.get(p.periodId)
    if (m) monthNetMap.set(m, (monthNetMap.get(m) ?? D(0)).plus(D(p.portion)))
  }

  return computeAvgBurn(priorMonths.map((m) => (monthNetMap.get(m) ?? D(0)).toFixed(2)))
}

async function computeRunwayMetricsUncached(filter: AppContextFilter): Promise<RunwayResult> {
  const meta = buildMetricMeta(filter)
  const [tree, periods] = await Promise.all([getCachedCoaTree(), getCachedPeriods()])

  const resolved = resolveBaskets(await loadAccountMapping(tree), tree)
  const cashEquivIds = Array.from(new Set([...resolved.cash, ...resolved.bank, ...resolved.deposit]))
  const liquidCoaIds: Id[] = postableAccountIds(tree, ['Liquid Assets'])
  const liabCoaIds: Id[] = postableAccountIds(tree, ['Current Liabilities'])
  const allRatioCoa = [...liquidCoaIds, ...liabCoaIds]

  // Independent reads start together: cash position, average burn, P&L margins and current-ratio balances.
  const [cashPos, avgBurn, pnlRes, balRes] = await Promise.all([
    computeCashPosition(filter, { includeByEntity: false, includeCompare: false }),
    averageBurn(filter, periods, cashEquivIds),
    computePnl(filter),
    allRatioCoa.length > 0 ? balancesAt({ asOf: filter.asOf, coaIds: allRatioCoa, filter }) : Promise.resolve(null),
  ])

  const runway = computeRunway(cashPos.cashPosition, avgBurn)

  const amountOf = (key: string): Money => pnlRes.lines.find((l) => l.key === key)?.amount ?? '0.00'
  const liquidTotal = balRes ? sum(liquidCoaIds.map((id) => balRes.byCoa.get(id) ?? '0.00')) : '0.00'
  const liabTotal = balRes ? sum(liabCoaIds.map((id) => balRes.byCoa.get(id) ?? '0.00')) : '0.00'

  const ratios = computeRatios({
    revenue: amountOf('revenue'),
    grossProfit: amountOf('grossProfit'),
    netProfit: amountOf('netProfit'),
    liquidAssets: liquidTotal,
    currentLiabilities: liabTotal,
  })

  return {
    meta,
    runwayMonths: runway.runwayMonths,
    cashFlowPositive: runway.cashFlowPositive,
    avgBurn,
    grossMargin: ratios.grossMargin,
    netMargin: ratios.netMargin,
    currentRatio: ratios.currentRatio,
  }
}
