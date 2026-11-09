import '@tanstack/react-start/server-only'
import { memoMetric } from '~/server/cache'
import type { AppContextFilter } from '~/server/context'
import { builtBalancePeriods, snapshotBalanceTotals } from '~/server/dash/balance-snapshot-read'
import { loadBalanceBase, loadBalanceContext } from '~/server/services/balance-sheet/balance-inputs'
import { resolveBalanceTarget } from '~/lib/finance/balance-sheet/targets'
import {
  cumulativeGroupAmounts,
  trendPeriods,
  trendPoint,
  type BalanceTrendPoint,
  type BalanceTrendResult,
} from '~/lib/finance/balance-sheet/trend'
import type { Id } from '~/lib/core/types'

export type { BalanceTrendResult }

/**
 * The balance sheet totals of the 12 months that end with the report month. A Closed month with saved totals comes from
 * the snapshot; every other month (and the report month itself, so it always agrees with the table) comes from one live
 * running sum over the opening balances and the journals of the periods that are not closed. A month that is neither
 * saved nor reachable from those opening balances is left out and counted in `missingCount`.
 */
export function computeBalanceTrend(filter: AppContextFilter): Promise<BalanceTrendResult> {
  return memoMetric('balanceTrend', filter, () => computeBalanceTrendUncached(filter))
}

async function computeBalanceTrendUncached(filter: AppContextFilter): Promise<BalanceTrendResult> {
  const context = await loadBalanceContext(filter)
  const target = resolveBalanceTarget(context.periods, filter)
  if (!target) return { points: [], missingCount: 0 }

  const candidates = trendPeriods(context.periods, target.period)
  const built = await builtBalancePeriods()
  const targetId = target.period.periodeId
  const fromSnapshot = candidates.filter(
    (p) => p.periodeId !== targetId && p.status === 'Closed' && built.has(p.periodeId),
  )
  const live = candidates.filter((p) => !fromSnapshot.includes(p))

  const snapshotTotals = await snapshotBalanceTotals(
    fromSnapshot.map((p) => p.periodeId),
    filter.segmentDetailIds,
  )

  const base = await loadBalanceBase(context, target)
  const movementPeriods = base.plan.plan.movementPeriods
  const reachable = new Set(movementPeriods.map((p) => p.periodeId))
  const endStates = live
    .filter((p) => reachable.has(p.periodeId))
    .map((p): { periodId: Id; after: Id } => ({
      periodId: p.periodeId,
      // The report month takes its period 13 along when the report includes it.
      after: p.periodeId === targetId && target.p13 ? target.p13.periodeId : p.periodeId,
    }))
  const liveTotals = cumulativeGroupAmounts({
    tree: context.tree,
    openings: base.openings,
    movements: base.movements,
    movementPeriods,
    endStates,
  })

  const points: BalanceTrendPoint[] = []
  for (const period of candidates) {
    const saved = snapshotTotals.get(period.periodeId)
    const running = liveTotals.get(period.periodeId)
    if (saved && fromSnapshot.includes(period)) points.push(trendPoint(period, saved, 'snapshot'))
    else if (running) points.push(trendPoint(period, running, 'live'))
  }
  return { points, missingCount: candidates.length - points.length }
}
