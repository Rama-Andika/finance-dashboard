import '@tanstack/react-start/server-only'
import { sql, type SQL } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { SLICE_CONCURRENCY, chunk, chunkOrAll, mapLimit, sliceCombos } from '~/server/db/chunk'
import { assertSegmentColumn } from '~/server/db/segment-column'
import { groupPeriodsByTable } from '~/server/db/gl-tables'
import { D } from '~/lib/core/money'
import { glMovementsCache, hashIds, type CachedMovementRow } from '~/server/cache'
import { GL_SNAPSHOT_SEGMENT_COLUMN, builtGlPeriods, snapshotMovements } from '~/server/dash/gl-snapshot'
import { accumulate, glTableSql, type GlTableSql } from '~/server/repo/gl/shared'
import type { AccountGroup, Id, Period } from '~/lib/core/types'

export type MovementRow = CachedMovementRow

export type MovementsByPeriodsOptions = {
  periods: Period[]
  segCol: string
  segIds: Id[] | 'all'
  coaIds?: Id[]
  accountGroups?: AccountGroup[]
  byPeriod?: boolean
  byLocation?: boolean
  /** Read closed periods from the dash_snap_gl_monthly snapshot when they are in it (default true; tests turn it off). */
  useSnapshot?: boolean
}

/**
 * Closed periods never change, so their movements are cached per (table, period, filters).
 * Cached rows always carry `periodId`; `byPeriod` only decides whether callers see it, so
 * P&L, trend and drill-down calls share the same cache entries.
 */
function closedPeriodCacheKey(
  tableName: string,
  periodeId: string,
  opts: MovementsByPeriodsOptions,
): string {
  const segHash = hashIds(opts.segIds)
  const coaHash = hashIds(opts.coaIds)
  const groups = (opts.accountGroups || []).slice().sort().join(',')
  return `mv|${tableName}|${periodeId}|Closed|${opts.segCol}|${segHash}|${coaHash}|loc:${Boolean(opts.byLocation)}|g:${groups}`
}

type MovementDbRow = {
  coaId: string
  periodId?: string
  locationId?: string
  debet: string | number
  credit: string | number
}

function toMovementRow(r: MovementDbRow): MovementRow {
  return {
    coaId: String(r.coaId),
    periodId: r.periodId ? String(r.periodId) : undefined,
    locationId: r.locationId ? String(r.locationId) : undefined,
    debet: D(r.debet || 0).toFixed(2),
    credit: D(r.credit || 0).toFixed(2),
  }
}

/** One slice (a few periods, accounts and segments) of the movement query; the optional columns and joins follow `opts`. */
function movementQuery(
  tables: GlTableSql,
  opts: MovementsByPeriodsOptions,
  slice: { periodIds: Id[]; coaIds: Id[] | undefined; segIds: Id[] | undefined },
): SQL {
  const { glIdent, glDetailIdent, segIdent, notCanceled } = tables
  const periodColumn = opts.byPeriod ? sql`, g.period_id AS periodId` : sql``
  const locationColumn = opts.byLocation ? sql`, sd.location_id AS locationId` : sql``
  const accountGroupJoin =
    opts.accountGroups && opts.accountGroups.length > 0
      ? sql`JOIN coa c ON c.coa_id = d.coa_id AND c.account_group IN (${inList(opts.accountGroups)})`
      : sql``
  const locationJoin = opts.byLocation ? sql`LEFT JOIN segment_detail sd ON sd.segment_detail_id = d.${segIdent}` : sql``
  const coaFilter = slice.coaIds ? sql`AND d.coa_id IN (${inList(slice.coaIds)})` : sql``
  const segFilter = slice.segIds ? sql`AND d.${segIdent} IN (${inList(slice.segIds)})` : sql``
  const periodGroup = opts.byPeriod ? sql`, g.period_id` : sql``
  const locationGroup = opts.byLocation ? sql`, sd.location_id` : sql``

  // STRAIGHT_JOIN: drive from gl (period index) → gl_detail (gl_id) → coa. Without it the optimizer
  // starts from coa and scans the whole gl_detail history of those accounts (minutes on 13M rows).
  return sql`
      SELECT STRAIGHT_JOIN d.coa_id AS coaId
             ${periodColumn}
             ${locationColumn}
             , SUM(d.debet) AS debet, SUM(d.credit) AS credit
      FROM ${glIdent} g
      JOIN ${glDetailIdent} d ON d.gl_id = g.gl_id
      ${accountGroupJoin}
      ${locationJoin}
      WHERE g.posted_status = 1
        ${notCanceled}
        AND g.period_id IN (${inList(slice.periodIds)})
        ${coaFilter}
        ${segFilter}
      GROUP BY d.coa_id
               ${periodGroup}
               ${locationGroup}
    `
}

async function queryMovementsFromDb(
  tableName: string,
  tablePeriods: Period[],
  opts: MovementsByPeriodsOptions,
): Promise<MovementRow[]> {
  if (tablePeriods.length === 0) return []
  if (opts.segIds !== 'all' && opts.segIds.length === 0) return []

  const tables = await glTableSql(tableName, opts.segCol)
  const periodChunks = chunk(tablePeriods.map((p) => p.periodeId))
  const combos = sliceCombos(periodChunks, chunkOrAll(opts.coaIds), chunkOrAll(opts.segIds))
  const slices = await mapLimit(combos, SLICE_CONCURRENCY, async ([periodIds, coaIds, segIds]) => {
    const qRows = await rows<MovementDbRow>(movementQuery(tables, opts, { periodIds, coaIds, segIds }))
    return qRows.map(toMovementRow)
  })
  return slices.flat()
}

export async function movementsByPeriods(opts: MovementsByPeriodsOptions): Promise<MovementRow[]> {
  if (opts.periods.length === 0) return []
  if (opts.coaIds && opts.coaIds.length === 0) return []

  assertSegmentColumn(opts.segCol)

  const grouped = groupPeriodsByTable(opts.periods)
  const resultMap = new Map<string, MovementRow>()

  const mergeRows = (rowsToMerge: readonly MovementRow[]) => {
    for (const r of rowsToMerge) {
      const periodId = opts.byPeriod ? r.periodId : undefined
      const key = `${r.coaId}|${periodId ?? ''}|${r.locationId ?? ''}`
      accumulate(resultMap, key, r, () => ({ ...r, periodId }))
    }
  }

  // One query per GL table for all periods that are not cached yet, all tables in parallel.
  await Promise.all(
    Array.from(grouped.entries()).map(async ([tableName, tablePeriods]) => {
      const uncachedClosed: Period[] = []
      // Open or Pre Closed periods are NEVER cached (D20)
      const toQuery: Period[] = []

      for (const p of tablePeriods) {
        if (p.status !== 'Closed') {
          toQuery.push(p)
          continue
        }
        const hit = glMovementsCache.get(closedPeriodCacheKey(tableName, p.periodeId, opts))
        if (hit) mergeRows(hit)
        else uncachedClosed.push(p)
      }

      // Closed periods that are in the snapshot are read from it (small, indexed); the rest from the ERP tables.
      const built = opts.useSnapshot !== false && opts.segCol === GL_SNAPSHOT_SEGMENT_COLUMN ? await builtGlPeriods() : new Set<string>()
      const fromSnapshot = uncachedClosed.filter((p) => built.has(p.periodeId))
      const fromErp = uncachedClosed.filter((p) => !built.has(p.periodeId))

      const [snapshotRows, erpRows, openRows] = await Promise.all([
        fromSnapshot.length > 0 ? snapshotMovements(fromSnapshot.map((p) => p.periodeId), opts) : Promise.resolve([]),
        queryMovementsFromDb(tableName, fromErp, { ...opts, byPeriod: true }),
        queryMovementsFromDb(tableName, toQuery, opts),
      ])
      const closedRows = snapshotRows.concat(erpRows)

      const byPeriod = new Map<string, MovementRow[]>(uncachedClosed.map((p) => [p.periodeId, []]))
      for (const r of closedRows) byPeriod.get(r.periodId ?? '')?.push(r)
      for (const [periodeId, periodRows] of byPeriod) {
        glMovementsCache.set(closedPeriodCacheKey(tableName, periodeId, opts), periodRows)
        mergeRows(periodRows)
      }
      mergeRows(openRows)
    }),
  )

  return Array.from(resultMap.values())
}


export * from '~/server/repo/gl/gl-by-date.repo'
export * from '~/server/repo/gl/gl-opening.repo'
export * from '~/server/repo/gl/gl-journal.repo'
