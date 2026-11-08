import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { glTablesOf } from '~/server/db/gl-tables'
import { inList } from '~/server/db/in-list'
import { SLICE_CONCURRENCY, chunk, mapLimit } from '~/server/db/chunk'
import { glTableHasCanceledDate } from '~/server/db/gl-columns'
import { memo } from '~/server/cache'
import { PERIOD_STATS_CACHE_PREFIX } from '~/server/dash/tables'
import type { PeriodHeaderStats } from '~/lib/finance/period/period-fingerprint'
import type { Id, Period } from '~/lib/core/types'

type StatsDbRow = {
  journals: string | number
  maxGlId: string | number | null
  posted: string | number | null
  canceled: string | number | null
}

/** One row of the grouped read: the counts of one period of the table. */
type BatchStatsDbRow = StatsDbRow & { periodId: string | number }

/** The counts as strings; a period without journals (no row, or null aggregates) is all zeros. */
function toStats(r: StatsDbRow | undefined): PeriodHeaderStats {
  return {
    journals: String(r?.journals ?? 0),
    maxGlId: String(r?.maxGlId ?? 0),
    posted: String(r?.posted ?? 0),
    canceled: String(r?.canceled ?? 0),
  }
}

/**
 * A cheap summary of the journal headers of one period: one index range on period_id, the detail lines are not read.
 * A journal added, removed, posted, un-posted or canceled changes it; an edit of an amount inside an existing
 * journal does not (the snapshot job rebuilds the newest periods daily for that reason).
 */
export async function glPeriodStats(period: Pick<Period, 'periodeId' | 'tableName'>): Promise<PeriodHeaderStats> {
  const { gl } = glTablesOf(period.tableName)
  // Older ERP versions have no canceled_date column on the GL header.
  const canceledColumn = (await glTableHasCanceledDate(gl))
    ? sql`COALESCE(SUM(g.canceled_date IS NOT NULL), 0)`
    : sql`0`
  const res = await rows<StatsDbRow>(sql`
    SELECT COUNT(*) AS journals,
           COALESCE(MAX(g.gl_id), 0) AS maxGlId,
           COALESCE(SUM(g.posted_status = 1), 0) AS posted,
           ${canceledColumn} AS canceled
    FROM ${sql.identifier(gl)} g
    WHERE g.period_id = ${period.periodeId}
  `)
  return toStats(res[0])
}

/**
 * The same counts for several periods of ONE GL table: one grouped query per slice of 1,000 periods, not one query per
 * period. A period without journals is not in the answer of the database, so it gets all zeros here, as in `glPeriodStats`.
 */
export async function glPeriodStatsOfTable(
  tableName: string,
  periodIds: readonly Id[],
): Promise<Map<Id, PeriodHeaderStats>> {
  const { gl } = glTablesOf(tableName)
  const result = new Map<Id, PeriodHeaderStats>()
  if (periodIds.length === 0) return result

  for (const id of periodIds) result.set(id, toStats(undefined))

  // Older ERP versions have no canceled_date column on the GL header.
  const canceledColumn = (await glTableHasCanceledDate(gl))
    ? sql`COALESCE(SUM(g.canceled_date IS NOT NULL), 0)`
    : sql`0`
  const slices = await mapLimit(chunk(periodIds), SLICE_CONCURRENCY, (slice) =>
    rows<BatchStatsDbRow>(sql`
      SELECT g.period_id AS periodId,
             COUNT(*) AS journals,
             COALESCE(MAX(g.gl_id), 0) AS maxGlId,
             COALESCE(SUM(g.posted_status = 1), 0) AS posted,
             ${canceledColumn} AS canceled
      FROM ${sql.identifier(gl)} g
      WHERE g.period_id IN (${inList(slice)})
      GROUP BY g.period_id
    `),
  )
  for (const r of slices.flat()) result.set(String(r.periodId), toStats(r))
  return result
}

/** How long one cycle step may reuse the counts another step read just before it. */
export const SHARED_STATS_TTL_MS = 60_000

/**
 * `glPeriodStats` for many periods with a short memory, for the checks of the refresh cycle: the GL and cash-lines
 * snapshots compare the same periods one after the other, so the second step reuses the counts of the first instead of
 * asking the ERP again. The periods that are not in that memory are read together, one grouped query per GL table.
 * Building a period must read fresh counts (`glPeriodStats`): they are its fingerprint and are taken before its rows.
 * A count that is up to a minute old only delays noticing a journal change by one cycle; it never hides one for longer.
 * The memory key of a period is `PERIOD_STATS_CACHE_PREFIX + table:period`; a failed read is not remembered.
 */
export async function glPeriodStatsSharedMany(
  periods: ReadonlyArray<Pick<Period, 'periodeId' | 'tableName'>>,
): Promise<Map<Id, PeriodHeaderStats>> {
  const idsByTable = new Map<string, Id[]>()
  for (const period of periods) {
    glTablesOf(period.tableName) // rejects a name that is not a GL table, before any query
    const ids = idsByTable.get(period.tableName)
    if (ids) ids.push(period.periodeId)
    else idsByTable.set(period.tableName, [period.periodeId])
  }

  // One read per table, started by the first period of that table that is not in the memory.
  const reads = new Map<string, Promise<Map<Id, PeriodHeaderStats>>>()
  const readOf = (tableName: string): Promise<Map<Id, PeriodHeaderStats>> => {
    let read = reads.get(tableName)
    if (!read) {
      read = glPeriodStatsOfTable(tableName, idsByTable.get(tableName) ?? [])
      reads.set(tableName, read)
    }
    return read
  }

  const entries = await Promise.all(
    periods.map(async (period) => {
      const stats = await memo(
        `${PERIOD_STATS_CACHE_PREFIX}${period.tableName}:${period.periodeId}`,
        SHARED_STATS_TTL_MS,
        async () => (await readOf(period.tableName)).get(period.periodeId) ?? toStats(undefined),
      )
      return [period.periodeId, stats] as const
    }),
  )
  return new Map(entries)
}
