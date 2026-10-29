import { postableAccountIds } from '~/lib/finance/coa-tree'
import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D, sum } from '~/lib/finance/money'
import type { Id, MetricMeta, Money } from '~/lib/finance/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedPeriods,
} from '~/server/context'
import { loadAccountMapping } from '~/server/services/mapping.helper'
import { resolveBaskets } from '~/lib/finance/basket-resolver'
import { balancesAt } from '~/server/services/balance.service'
import { computeCashPosition } from '~/server/services/cash-position.service'
import { computePnl } from '~/server/services/pnl.service'
import { linesOfCashJournals } from '~/server/repo/cashflow.repo'
import { allocateCash, type CfLine } from '~/lib/finance/cashflow'
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

export async function computeRunwayMetrics(
  filter: AppContextFilter,
): Promise<RunwayResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()

  // 1. Cash Position at asOf
  const cashPos = await computeCashPosition(filter, { includeByEntity: false, includeCompare: false })
  const cashPosition = cashPos.cashPosition

  // 2. Average Burn over the last 3 full months (months ending before month of asOf)
  const asOfMonth = filter.asOf.slice(0, 7)
  const priorMonths = Array.from(
    new Set(
      periods
        .filter((p) => p.type === 0 && p.endDate < filter.asOf && p.startDate.slice(0, 7) < asOfMonth)
        .map((p) => p.startDate.slice(0, 7)),
    ),
  ).sort().reverse().slice(0, 3)

  let avgBurn = '0.00'
  if (priorMonths.length > 0) {
    const mapping = await loadAccountMapping(tree)
    const resolved = resolveBaskets(mapping, tree)
    const cashEquivIds = Array.from(
      new Set([...resolved.cash, ...resolved.bank, ...resolved.deposit]),
    )

    const priorPeriods = periods.filter((p) =>
      priorMonths.includes(p.startDate.slice(0, 7)),
    )

    if (priorPeriods.length > 0 && cashEquivIds.length > 0) {
      const priorLines = await linesOfCashJournals({
        periods: priorPeriods,
        segCol: filter.entitySegmentColumn,
        segIds: filter.segmentDetailIds,
        cashCoaIds: cashEquivIds,
      })

      const cashSet = new Set(cashEquivIds)
      const segIdSet = filter.segmentDetailIds === 'all' ? null : new Set(filter.segmentDetailIds)
      const isOurCash = (l: CfLine) =>
        cashSet.has(l.coaId) && (!segIdSet || (l.segmentDetailId !== null && segIdSet.has(l.segmentDetailId)))
      const portions = allocateCash(priorLines, isOurCash)

      const periodMonthMap = new Map(
        priorPeriods.map((p) => [p.periodeId, p.startDate.slice(0, 7)]),
      )
      const monthNetMap = new Map<string, Decimal>()
      for (const m of priorMonths) {
        monthNetMap.set(m, D(0))
      }

      for (const p of portions) {
        const m = periodMonthMap.get(p.periodId)
        if (m) {
          monthNetMap.set(m, (monthNetMap.get(m) ?? D(0)).plus(D(p.portion)))
        }
      }

      const monthlyNets = priorMonths.map((m) =>
        (monthNetMap.get(m) ?? D(0)).toFixed(2),
      )
      avgBurn = computeAvgBurn(monthlyNets)
    }
  }

  // 3. Runway calculation
  const runway = computeRunway(cashPosition, avgBurn)

  // 4. Margins from PnL
  const pnlRes = await computePnl(filter)
  const revLine = pnlRes.lines.find((l) => l.key === 'revenue')?.amount ?? '0.00'
  const gpLine = pnlRes.lines.find((l) => l.key === 'grossProfit')?.amount ?? '0.00'
  const npLine = pnlRes.lines.find((l) => l.key === 'netProfit')?.amount ?? '0.00'

  // 5. Current Ratio: Liquid Assets / Current Liabilities at asOf
  const liquidCoaIds: Id[] = postableAccountIds(tree, ['Liquid Assets'])
  const liabCoaIds: Id[] = postableAccountIds(tree, ['Current Liabilities'])

  let liquidTotal = '0.00'
  let liabTotal = '0.00'
  const allRatioCoa = [...liquidCoaIds, ...liabCoaIds]

  if (allRatioCoa.length > 0) {
    const balRes = await balancesAt({
      asOf: filter.asOf,
      coaIds: allRatioCoa,
      filter,
    })
    liquidTotal = sum(liquidCoaIds.map((id) => balRes.byCoa.get(id) ?? '0.00'))
    liabTotal = sum(liabCoaIds.map((id) => balRes.byCoa.get(id) ?? '0.00'))
  }

  const ratios = computeRatios({
    revenue: revLine,
    grossProfit: gpLine,
    netProfit: npLine,
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
