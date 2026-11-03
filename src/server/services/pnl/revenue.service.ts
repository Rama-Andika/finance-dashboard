import '@tanstack/react-start/server-only'
import { activePeriodsOf, entitiesOfFilter } from '~/lib/filters/filter-scope'
import { postableAccountIds } from '~/lib/finance/coa/coa-tree'
import type { Money, Id, MetricMeta, Breakdown } from '~/lib/core/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedEntities,
  getCachedPeriods,
} from '~/server/context'
import { movementsByPeriods } from '~/server/repo/gl/gl.repo'
import { memoMetric } from '~/server/cache'
import { loadPlMovements, onlyAccounts } from '~/server/services/pnl/pl-movements'
import {
  aggregateRevenue,
  buildRevenueBreakdown,
  groupFolders,
  movementsByCoaOf,
  revenueTrend,
  splitRevenueByEntity,
  sumNetRevenue,
} from '~/lib/finance/pnl/revenue'

export type RevenueResult = {
  meta: MetricMeta
  total: Money
  compareTotal: Money | null
  trend: Array<{ month: string; amount: Money }>
  byFolder: Breakdown[]
  byEntity: Array<{ id: Id; code: string; name: string; amount: Money }>
  /** Revenue that belongs to no entity row (journal lines without a location): total − Σ byEntity. "0.00" when none. */
  entityUnassigned: Money
}

export function computeRevenue(filter: AppContextFilter): Promise<RevenueResult> {
  return memoMetric('revenue', filter, () => computeRevenueUncached(filter))
}

async function computeRevenueUncached(filter: AppContextFilter): Promise<RevenueResult> {
  const meta = buildMetricMeta(filter)
  const [tree, periods, { entities }] = await Promise.all([getCachedCoaTree(), getCachedPeriods(), getCachedEntities()])

  const revenueCoaIds: Id[] = postableAccountIds(tree, ['Revenue'])

  if (revenueCoaIds.length === 0 || filter.periodIds.length === 0) {
    return {
      meta,
      total: '0.00',
      compareTotal: null,
      trend: filter.months.map((m) => ({ month: m, amount: '0.00' })),
      byFolder: [],
      byEntity: [],
      entityUnassigned: '0.00',
    }
  }

  // The per-entity split needs its own read; the comparison total reuses the shared P&L movements.
  const hasCompare = Boolean(filter.compare && filter.compare.periodIds.length > 0)
  const [rows, allCompareRows] = await Promise.all([
    movementsByPeriods({
      periods: activePeriodsOf(periods, filter.periodIds),
      segCol: filter.entitySegmentColumn,
      segIds: filter.segmentDetailIds,
      coaIds: revenueCoaIds,
      byPeriod: true,
      byLocation: true,
    }),
    hasCompare ? loadPlMovements(filter, filter.compare.periodIds) : Promise.resolve([]),
  ])

  const compareTotal = hasCompare ? sumNetRevenue(onlyAccounts(allCompareRows, revenueCoaIds)).toFixed(2) : null

  const aggregate = aggregateRevenue(rows)
  const byFolder = buildRevenueBreakdown(tree, groupFolders(tree, 'Revenue'), movementsByCoaOf(aggregate.byCoa))
  const { byEntity, entityUnassigned } = splitRevenueByEntity(
    entitiesOfFilter(entities, filter.locationIds),
    aggregate.byLocation,
    aggregate.total,
  )

  return {
    meta,
    total: aggregate.total.toFixed(2),
    compareTotal,
    trend: revenueTrend(aggregate.byPeriod, periods, filter.months),
    byFolder,
    byEntity,
    entityUnassigned,
  }
}
