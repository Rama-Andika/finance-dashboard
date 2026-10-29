import { postableAccountIds } from '~/lib/finance/coa-tree'
import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D, sum } from '~/lib/finance/money'
import type { Money, Id, MetricMeta, Breakdown } from '~/lib/finance/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedEntities,
  getCachedPeriods,
} from '~/server/context'
import { movementsByPeriods } from '~/server/repo/gl.repo'
import { memoMetric } from '~/server/cache'
import { loadPlMovements, onlyAccounts } from '~/server/services/shared/pl-movements'
import {
  computeNetRevenue,
  groupFolders,
  buildRevenueBreakdown,
} from '~/lib/finance/revenue'

export type RevenueResult = {
  meta: MetricMeta
  total: Money
  compareTotal: Money | null
  trend: Array<{ month: string; amount: Money }>
  byFolder: Breakdown[]
  byEntity: Array<{ code: string; name: string; amount: Money }>
}

export function computeRevenue(filter: AppContextFilter): Promise<RevenueResult> {
  return memoMetric('revenue', filter, () => computeRevenueUncached(filter))
}

async function computeRevenueUncached(filter: AppContextFilter): Promise<RevenueResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()

  // 1. Collect POSTABLE Revenue accounts
  const revenueCoaIds: Id[] = postableAccountIds(tree, ['Revenue'])

  if (revenueCoaIds.length === 0 || filter.periodIds.length === 0) {
    return {
      meta,
      total: '0.00',
      compareTotal: null,
      trend: filter.months.map((m) => ({ month: m, amount: '0.00' })),
      byFolder: [],
      byEntity: [],
    }
  }

  // 2. Fetch movements for active periods
  const activePeriods = periods.filter((p) => filter.periodIds.includes(p.periodeId))
  // The per-entity split needs its own read; the comparison total reuses the shared P&L movements.
  const hasCompare = Boolean(filter.compare && filter.compare.periodIds.length > 0)
  const [rows, allCompareRows] = await Promise.all([
    movementsByPeriods({
      periods: activePeriods,
      segCol: filter.entitySegmentColumn,
      segIds: filter.segmentDetailIds,
      coaIds: revenueCoaIds,
      byPeriod: true,
      byLocation: true,
    }),
    hasCompare ? loadPlMovements(filter, filter.compare.periodIds) : Promise.resolve([]),
  ])

  // 3. Compare total
  let compareTotal: Money | null = null
  if (hasCompare) {
    const compareRows = onlyAccounts(allCompareRows, revenueCoaIds)
    let cmpSum = D(0)
    for (const r of compareRows) {
      cmpSum = cmpSum.plus(D(computeNetRevenue(r.debet, r.credit)))
    }
    compareTotal = cmpSum.toFixed(2)
  }

  // 4. Aggregates
  let totalSum = D(0)
  const movementsByCoa = new Map<Id, { debet: Money; credit: Money }>()
  const byPeriodMap = new Map<Id, Decimal>()
  const byLocationMap = new Map<Id, Decimal>()

  for (const r of rows) {
    const net = D(computeNetRevenue(r.debet, r.credit))
    totalSum = totalSum.plus(net)

    // By coa
    const currCoa = movementsByCoa.get(r.coaId) ?? { debet: '0.00', credit: '0.00' }
    movementsByCoa.set(r.coaId, {
      debet: D(currCoa.debet).plus(D(r.debet)).toFixed(2),
      credit: D(currCoa.credit).plus(D(r.credit)).toFixed(2),
    })

    // By period
    if (r.periodId) {
      const currP = byPeriodMap.get(r.periodId) ?? D(0)
      byPeriodMap.set(r.periodId, currP.plus(net))
    }

    // By location
    if (r.locationId) {
      const currL = byLocationMap.get(r.locationId) ?? D(0)
      byLocationMap.set(r.locationId, currL.plus(net))
    }
  }

  // 5. Breakdown by folder
  const folders = groupFolders(tree, 'Revenue')
  const byFolder = buildRevenueBreakdown(tree, folders, movementsByCoa)

  // 6. Trend per month
  const periodById = new Map(periods.map((p) => [p.periodeId, p]))
  const trend = filter.months.map((month) => {
    let monthSum = D(0)
    for (const [pId, amount] of byPeriodMap.entries()) {
      const p = periodById.get(pId)
      if (p && p.startDate.slice(0, 7) === month) {
        monthSum = monthSum.plus(amount)
      }
    }
    return {
      month,
      amount: monthSum.toFixed(2),
    }
  })

  // 7. By Entity
  const { entities } = await getCachedEntities()
  const targetEntities =
    filter.locationIds === 'all'
      ? entities
      : entities.filter((e) => filter.locationIds.includes(e.locationId))

  const byEntity = targetEntities.map((e) => {
    const entAmount = byLocationMap.get(e.locationId) ?? D(0)
    return {
      code: e.code,
      name: e.name,
      amount: entAmount.toFixed(2),
    }
  })

  return {
    meta,
    total: totalSum.toFixed(2),
    compareTotal,
    trend,
    byFolder,
    byEntity,
  }
}
