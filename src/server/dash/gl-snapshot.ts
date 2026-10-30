import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { pool } from '~/server/db/client'
import { inList } from '~/server/db/in-list'
import { chunk, chunkOrAll, sliceCombos } from '~/server/db/chunk'
import { glTablesOf } from '~/server/db/gl-tables'
import { glTableHasCanceledDate } from '~/server/db/gl-columns'
import { memo } from '~/server/cache'
import { listPeriods } from '~/server/repo/periods.repo'
import type { AccountGroup, Id, Period } from '~/lib/core/types'
import type { CachedMovementRow } from '~/server/cache'
import { DASH_TABLES, dashTable } from './tables'
import { dashLog } from './log'

/** The snapshot holds the entity segment only (segment1_id); other segment columns are always read from the ERP. */
export const GL_SNAPSHOT_SEGMENT_COLUMN = 'segment1_id'

const BUILT_TTL_MS = 30_000

/** Closed periods that are fully present in dash_snap_gl_monthly. Empty when the tables do not exist yet. */
export async function builtGlPeriods(): Promise<Set<string>> {
  return memo('dash:gl:built', BUILT_TTL_MS, async () => {
    try {
      const res = await rows<{ id: string }>(sql`SELECT CAST(period_id AS CHAR) AS id FROM ${sql.identifier(DASH_TABLES.glPeriods)}`)
      return new Set(res.map((r) => String(r.id)))
    } catch {
      return new Set<string>()
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

  for (const [pChunk, cChunk, sChunk] of sliceCombos(chunk(periodIds), chunkOrAll(opts.coaIds), chunkOrAll(opts.segIds))) {
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

export type GlRefreshResult =
  | { ran: true; built: number; removed: number; durationMs: number }
  | { ran: false; reason: 'locked' | 'nothing-to-do' }

/**
 * Adds every Closed period that is not in the snapshot yet (one period per transaction, oldest last so the newest
 * months, which are queried most, are available first) and drops periods that are no longer Closed.
 * Safe to run repeatedly; one run at a time (advisory lock).
 */
export async function refreshGlMonthlySnapshot(): Promise<GlRefreshResult> {
  const started = Date.now()
  const conn = await pool.getConnection()
  let locked = false
  try {
    await conn.query('SET SESSION max_execution_time = 0').catch(() => {})
    await conn.query('SET SESSION max_statement_time = 0').catch(() => {})
    const [lockRows] = await conn.query("SELECT GET_LOCK('dash_refresh_gl', 0) AS got")
    locked = Number((lockRows as Array<{ got: number }>)[0]?.got) === 1
    if (!locked) return { ran: false, reason: 'locked' }

    const periods = await listPeriods()
    const closed = periods.filter((p) => p.status === 'Closed')
    const closedIds = new Set(closed.map((p) => p.periodeId))

    const [builtRows] = await conn.query('SELECT CAST(period_id AS CHAR) AS id FROM ??', [dashTable(DASH_TABLES.glPeriods)])
    const built = new Set((builtRows as Array<{ id: string }>).map((r) => String(r.id)))

    // A period that is no longer Closed was reopened: its snapshot rows may be outdated.
    const stale = Array.from(built).filter((id) => !closedIds.has(id))
    for (const slice of chunk(stale)) {
      await conn.query('DELETE FROM ?? WHERE period_id IN (?)', [dashTable(DASH_TABLES.glMonthly), slice])
      await conn.query('DELETE FROM ?? WHERE period_id IN (?)', [dashTable(DASH_TABLES.glPeriods), slice])
    }

    const missing = closed.filter((p) => !built.has(p.periodeId)).sort((a, b) => b.startDate.localeCompare(a.startDate))
    for (const [index, period] of missing.entries()) {
      const t0 = Date.now()
      await buildPeriod(conn, period)
      dashLog.info(`GL snapshot ${index + 1}/${missing.length}: ${period.name} (${Math.round((Date.now() - t0) / 1000)}s)`)
    }

    if (missing.length === 0 && stale.length === 0) return { ran: false, reason: 'nothing-to-do' }
    return { ran: true, built: missing.length, removed: stale.length, durationMs: Date.now() - started }
  } finally {
    if (locked) await conn.query("SELECT RELEASE_LOCK('dash_refresh_gl')").catch(() => {})
    conn.release()
  }
}

type Conn = Awaited<ReturnType<typeof pool.getConnection>>

/** One period: rows and the "built" marker are written in one transaction, so readers never see half a period. */
async function buildPeriod(conn: Conn, period: Period): Promise<void> {
  const { gl, glDetail } = glTablesOf(period.tableName)
  const started = Date.now()
  const monthly = dashTable(DASH_TABLES.glMonthly)
  const periods = dashTable(DASH_TABLES.glPeriods)

  await conn.beginTransaction()
  try {
    await conn.query('DELETE FROM ?? WHERE period_id = ?', [monthly, period.periodeId])
    // Older ERP versions have no canceled_date column on the GL header; the filter is only added when the column exists.
    const notCanceled = (await glTableHasCanceledDate(gl)) ? ' AND g.canceled_date IS NULL' : ''
    // STRAIGHT_JOIN: drive from gl (period index) into gl_detail, as the live queries do
    const [result] = await conn.query(
      `INSERT INTO ?? (period_id, coa_id, segment_id, debet, credit)
       SELECT STRAIGHT_JOIN g.period_id, d.coa_id, COALESCE(d.${GL_SNAPSHOT_SEGMENT_COLUMN}, 0), SUM(d.debet), SUM(d.credit)
       FROM ?? g JOIN ?? d ON d.gl_id = g.gl_id
       WHERE g.posted_status = 1${notCanceled} AND g.period_id = ?
       GROUP BY g.period_id, d.coa_id, COALESCE(d.${GL_SNAPSHOT_SEGMENT_COLUMN}, 0)`,
      [monthly, gl, glDetail, period.periodeId],
    )
    const rowCount = Number((result as { affectedRows?: number }).affectedRows ?? 0)
    await conn.query(
      `INSERT INTO ?? (period_id, built_at, row_count, duration_ms) VALUES (?, UTC_TIMESTAMP(), ?, ?)
       ON DUPLICATE KEY UPDATE built_at = VALUES(built_at), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms)`,
      [periods, period.periodeId, rowCount, Date.now() - started],
    )
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  }
}
