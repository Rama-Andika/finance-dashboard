import '@tanstack/react-start/server-only'
import { env } from '~/server/env'
import { todayIn } from '~/lib/format/date'
import type { MetricInput } from '~/lib/filters/search-schema'
import type { ResolvedFilter, Id, MetricMeta } from '~/lib/finance/types'
import { memo } from '~/server/cache'
import { getEntitySegment, listEntities } from '~/server/repo/entities.repo'
import { listPeriods } from '~/server/repo/periods.repo'
import { listCoa } from '~/server/repo/coa.repo'
import { buildCoaTree } from '~/lib/finance/coa-tree'
import { parseEntityToken } from '~/lib/filters/entity-token'
import { resolvePeriod } from '~/lib/finance/periods'

const TEN_MINUTES = 10 * 60 * 1000

/** "Today" for all metrics: APP_TODAY when set (tests, reconciliation), else the date in APP_TIMEZONE. */
export function appToday(): string {
  return env.APP_TODAY ?? todayIn(env.APP_TIMEZONE)
}

export async function getCachedEntities() {
  return memo('entities:all', TEN_MINUTES, async () => {
    const seg = await getEntitySegment()
    const entities = await listEntities(seg.segmentId)
    return { segment: seg, entities }
  })
}

export async function getCachedPeriods() {
  return memo('periods:all', TEN_MINUTES, async () => {
    return listPeriods()
  })
}

export async function getCachedCoaTree() {
  return memo('coa:tree', TEN_MINUTES, async () => {
    const rows = await listCoa()
    return buildCoaTree(rows)
  })
}

export type AppContextFilter = ResolvedFilter & {
  entitySegmentColumn: string
  entityCount: number
  hasOpenPeriod: boolean
  months: string[]
  missingMonths: string[]
}

export async function resolveFilter(input: MetricInput): Promise<AppContextFilter> {
  const { segment, entities } = await getCachedEntities()
  const periods = await getCachedPeriods()

  const today = appToday()
  const resolvedPer = resolvePeriod(input.preset, input.p13, today, periods, { from: input.from, to: input.to })
  const { locationIds } = parseEntityToken(input.entity, entities)

  let segmentDetailIds: Id[] | 'all' = 'all'
  let entityCount = entities.length

  if (locationIds !== 'all') {
    entityCount = locationIds.length
    const idSet = new Set(locationIds)
    const detailIds: Id[] = []
    for (const e of entities) {
      if (idSet.has(e.locationId)) {
        detailIds.push(...e.segmentDetailIds)
      }
    }
    segmentDetailIds = detailIds
  }

  return {
    locationIds,
    segmentDetailIds,
    entitySegmentColumn: segment.columnName,
    entityCount,
    d1: resolvedPer.d1,
    asOf: resolvedPer.asOf,
    periodIds: resolvedPer.periodIds,
    compare: resolvedPer.compare,
    today,
    months: resolvedPer.months,
    missingMonths: resolvedPer.missingMonths,
    hasOpenPeriod: resolvedPer.hasOpenPeriod,
  }
}

export function buildMetricMeta(filter: AppContextFilter): MetricMeta {
  return {
    readAt: new Date().toISOString(),
    d1: filter.d1,
    asOf: filter.asOf,
    today: filter.today,
    entityCount: filter.entityCount,
    isAllEntities: filter.locationIds === 'all',
    hasOpenPeriod: filter.hasOpenPeriod,
    missingMonths: filter.missingMonths,
  }
}
