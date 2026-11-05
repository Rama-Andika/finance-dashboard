import '@tanstack/react-start/server-only'
import { toInt } from '~/server/db/convert'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk, chunkOrAll, sliceCombos } from '~/server/db/chunk'
import { glTablesOf } from '~/server/db/gl-tables'
import { glTableHasCanceledDate } from '~/server/db/gl-columns'
import { memo } from '~/server/cache'
import type { AccountGroup, Id, Period } from '~/lib/core/types'
import type { CachedMovementRow } from '~/server/cache'
import { DASH_TABLES, SNAPSHOT_SEGMENT_COLUMN, dashTable } from './tables'
import { refreshClosedPeriods, type ClosedPeriodRefreshResult } from './closed-period-refresh'
import type { RefreshConnection } from './refresh-connection'
import { glPeriodStats } from '~/server/repo/gl/gl-period-stats.repo'
import { periodKey, statsKey } from '~/lib/finance/period/period-fingerprint'

/** The snapshot holds the entity segment only (segment1_id); other segment columns are always read from the ERP. */
export const GL_SNAPSHOT_SEGMENT_COLUMN = SNAPSHOT_SEGMENT_COLUMN

const BUILT_TTL_MS = 30_000

/**
 * Closed periods that are fully present in dash_snap_gl_monthly, as period id → "version" (build time and row count).
 * The version goes into cache keys, so a period that was rebuilt never answers from rows cached for its older build.
 * Empty when the tables do not exist yet.
 */
export async function builtGlPeriods(): Promise<Map<string, string>> {
  return memo('dash:gl:built', BUILT_TTL_MS, async () => {
    try {
      const res = await rows<{ id: string; builtAt: string | null; rowCount: number | string | null }>(sql`
        SELECT CAST(period_id AS CHAR) AS id,
               DATE_FORMAT(built_at, '%Y-%m-%dT%H:%i:%sZ') AS builtAt,
               row_count AS rowCount
        FROM ${sql.identifier(DASH_TABLES.glPeriods)}
      `)
      return new Map(res.map((r) => [String(r.id), `${r.builtAt ?? ''}#${r.rowCount ?? 0}`] as const))
    } catch {
      return new Map<string, string>()
    }
  })
}

export type SnapshotMovementsOptions = {
  segIds: Id[] | 'all'
  coaIds?: Id[]
  accountGroups?: AccountGroup[]
  byLocation?: boolean
}

/**
 * Movements of closed periods from the snapshot, shaped like the ERP query in `gl.repo` (always with `periodId`).
 * Same filters, same grouping; the caller only passes periods that are in `builtGlPeriods()`.
 */
export async function snapshotMovements(periodIds: Id[], opts: SnapshotMovementsOptions): Promise<CachedMovementRow[]> {
  if (periodIds.length === 0) return []
  if (opts.segIds !== 'all' && opts.segIds.length === 0) return []
  const table = sql.identifier(DASH_TABLES.glMonthly)
  const out: CachedMovementRow[] = []

  for (const [pChunk, cChunk, sChunk] of sliceCombos(
    chunk(periodIds),
    chunkOrAll(opts.coaIds),
    chunkOrAll(opts.segIds),
  )) {
    const res = await rows<{
      coaId: string
      periodId: string
      locationId?: string | null
      debet: string
      credit: string
    }>(sql`
      SELECT s.coa_id AS coaId, s.period_id AS periodId
             ${opts.byLocation ? sql`, sd.location_id AS locationId` : sql``}
             , SUM(s.debet) AS debet, SUM(s.credit) AS credit
      FROM ${table} s
      ${
        opts.accountGroups && opts.accountGroups.length > 0
          ? sql`JOIN coa c ON c.coa_id = s.coa_id AND c.account_group IN (${inList(opts.accountGroups)})`
          : sql``
      }
      ${opts.byLocation ? sql`LEFT JOIN segment_detail sd ON sd.segment_detail_id = s.segment_id` : sql``}
      WHERE s.period_id IN (${inList(pChunk)})
        ${cChunk ? sql`AND s.coa_id IN (${inList(cChunk)})` : sql``}
        ${sChunk ? sql`AND s.segment_id IN (${inList(sChunk)})` : sql``}
      GROUP BY s.coa_id, s.period_id ${opts.byLocation ? sql`, sd.location_id` : sql``}
    `)
    for (const r of res) {
      out.push({
        coaId: String(r.coaId),
        periodId: String(r.periodId),
        locationId: r.locationId ? String(r.locationId) : undefined,
        // DECIMAL(22,2) sums come back as 2-decimal strings
        debet: r.debet,
        credit: r.credit,
      })
    }
  }
  return out
}

// ---------------------------------------------------------------------------------------------
// Build (runs in the refresh job)
// ---------------------------------------------------------------------------------------------

export type GlRefreshResult = ClosedPeriodRefreshResult

/**
 * Keeps the snapshot in step with the ERP:
 * - drops periods that are no longer Closed (re-opened);
 * - builds every Closed period that is not in the snapshot yet, newest first;
 * - rebuilds a period whose fingerprint changed (see period-fingerprint.ts for how often each is checked).
 * Safe to run repeatedly; one run at a time (advisory lock).
 */
export function refreshGlMonthlySnapshot(): Promise<GlRefreshResult> {
  return refreshClosedPeriods(
    {
      label: 'GL snapshot',
      lockName: 'dash_refresh_gl',
      rowsTable: DASH_TABLES.glMonthly,
      markerTable: DASH_TABLES.glPeriods,
    },
    buildPeriod,
  )
}

type Conn = RefreshConnection

/** One period: rows and the "built" marker are written in one transaction, so readers never see half a period. */
async function buildPeriod(conn: Conn, period: Period): Promise<void> {
  const { gl, glDetail } = glTablesOf(period.tableName)
  const started = Date.now()
  const monthly = dashTable(DASH_TABLES.glMonthly)
  const periods = dashTable(DASH_TABLES.glPeriods)

  // The fingerprint is taken BEFORE the rows are read: a journal that changes while the period is built shows up as a
  // difference in the next run and triggers another build, instead of being missed.
  const pKey = periodKey(period)
  const sKey = statsKey(await glPeriodStats(period))

  await conn.beginTransaction()
  try {
    await conn.query('DELETE FROM ?? WHERE period_id = ?', [monthly, period.periodeId])
    // Older ERP versions have no canceled_date column on the GL header; the filter is only added when the column exists.
    const notCanceled = (await glTableHasCanceledDate(gl)) ? ' AND g.canceled_date IS NULL' : ''
    // STRAIGHT_JOIN: drive from gl (period index) into gl_detail, as the live queries do
    // COALESCE: debet and credit may be NULL in the ERP while the snapshot columns are NOT NULL, and a strict SQL mode
    // (the MySQL 5.7 default) refuses such a row. The live queries read a missing value as 0, so 0 gives the same sums.
    const [result] = await conn.query(
      `INSERT INTO ?? (period_id, coa_id, segment_id, debet, credit)
       SELECT STRAIGHT_JOIN g.period_id, d.coa_id, COALESCE(d.${GL_SNAPSHOT_SEGMENT_COLUMN}, 0), COALESCE(SUM(d.debet), 0), COALESCE(SUM(d.credit), 0)
       FROM ?? g JOIN ?? d ON d.gl_id = g.gl_id
       WHERE g.posted_status = 1${notCanceled} AND g.period_id = ?
       GROUP BY g.period_id, d.coa_id, COALESCE(d.${GL_SNAPSHOT_SEGMENT_COLUMN}, 0)`,
      [monthly, gl, glDetail, period.periodeId],
    )
    const rowCount = toInt((result as { affectedRows?: number }).affectedRows)
    await conn.query(
      `INSERT INTO ?? (period_id, built_at, row_count, duration_ms, period_key, stats_key, checked_at)
       VALUES (?, UTC_TIMESTAMP(), ?, ?, ?, ?, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE built_at = VALUES(built_at), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms),
                               period_key = VALUES(period_key), stats_key = VALUES(stats_key), checked_at = VALUES(checked_at)`,
      [periods, period.periodeId, rowCount, Date.now() - started, pKey, sKey],
    )
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  }
}
