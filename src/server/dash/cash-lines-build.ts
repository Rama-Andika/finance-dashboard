import '@tanstack/react-start/server-only'
import { pool } from '~/server/db/client'
import { toInt } from '~/server/db/convert'
import { chunk } from '~/server/db/chunk'
import { glTablesOf } from '~/server/db/gl-tables'
import { glTableHasCanceledDate } from '~/server/db/gl-columns'
import { hashIds } from '~/server/cache'
import { listPeriods } from '~/server/repo/master-data/periods.repo'
import { glPeriodStats } from '~/server/repo/gl/gl-period-stats.repo'
import {
  NEWEST_CLOSED_PERIODS,
  periodKey,
  statsKey,
  verifyDecision,
  type BuiltPeriodState,
} from '~/lib/finance/period/period-fingerprint'
import type { Id, Period } from '~/lib/core/types'
import { CASH_LINES_MAX_ACCOUNTS, DASH_TABLES, SNAPSHOT_SEGMENT_COLUMN, dashTable } from './tables'
import { dashLog } from './log'

export type CashLinesRefreshResult =
  | { ran: true; built: number; rebuilt: number; removed: number; durationMs: number }
  | { ran: false; reason: 'locked' | 'nothing-to-do' | 'no-cash-accounts' | 'too-many-accounts' }

type Conn = Awaited<ReturnType<typeof pool.getConnection>>

type BuiltRow = {
  id: string
  periodKey: string | null
  statsKey: string | null
  cashHash: string | null
  builtAt: string | null
  checkedAt: string | null
}

const toMs = (iso: string | null): number | null => {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Keeps dash_snap_cash_lines in step with the ERP, for the given cash accounts (cash, bank and deposit baskets):
 * builds every Closed period that is missing, rebuilds one whose fingerprint or cash account list changed, and drops
 * periods that are no longer Closed. Same rules as the GL snapshot (see period-fingerprint.ts).
 * Safe to run repeatedly; one run at a time (advisory lock).
 */
export async function refreshCashLinesSnapshot(cashCoaIds: Id[]): Promise<CashLinesRefreshResult> {
  if (cashCoaIds.length === 0) return { ran: false, reason: 'no-cash-accounts' }
  if (cashCoaIds.length > CASH_LINES_MAX_ACCOUNTS) {
    dashLog.warn(
      `cash-lines snapshot skipped: ${cashCoaIds.length} cash accounts is above the limit of ${CASH_LINES_MAX_ACCOUNTS}`,
    )
    return { ran: false, reason: 'too-many-accounts' }
  }
  const cashHash = hashIds(cashCoaIds)

  const started = Date.now()
  const conn = await pool.getConnection()
  let locked = false
  try {
    await conn.query('SET SESSION max_execution_time = 0').catch(() => {})
    await conn.query('SET SESSION max_statement_time = 0').catch(() => {})
    const [lockRows] = await conn.query("SELECT GET_LOCK('dash_refresh_cash', 0) AS got")
    locked = Number((lockRows as Array<{ got: number }>)[0]?.got) === 1
    if (!locked) return { ran: false, reason: 'locked' }

    const periods = await listPeriods()
    const closed = periods.filter((p) => p.status === 'Closed')
    const closedIds = new Set(closed.map((p) => p.periodeId))

    const [builtRows] = await conn.query(
      `SELECT CAST(period_id AS CHAR) AS id, period_key AS periodKey, stats_key AS statsKey, cash_hash AS cashHash,
              DATE_FORMAT(built_at, '%Y-%m-%dT%H:%i:%sZ') AS builtAt,
              DATE_FORMAT(checked_at, '%Y-%m-%dT%H:%i:%sZ') AS checkedAt
       FROM ??`,
      [dashTable(DASH_TABLES.cashPeriods)],
    )
    const builtById = new Map((builtRows as BuiltRow[]).map((r) => [String(r.id), r] as const))

    // A period that is no longer Closed was re-opened: its lines may be outdated.
    const stale = Array.from(builtById.keys()).filter((id) => !closedIds.has(id))
    for (const slice of chunk(stale)) {
      await conn.query('DELETE FROM ?? WHERE period_id IN (?)', [dashTable(DASH_TABLES.cashLines), slice])
      await conn.query('DELETE FROM ?? WHERE period_id IN (?)', [dashTable(DASH_TABLES.cashPeriods), slice])
    }

    const newestFirst = [...closed].sort((a, b) => b.startDate.localeCompare(a.startDate))
    const newestIds = new Set(newestFirst.slice(0, NEWEST_CLOSED_PERIODS).map((p) => p.periodeId))
    const nowMs = Date.now()

    const toBuild: Period[] = []
    const replaced = new Set<string>()
    const unchanged: string[] = []
    for (const period of newestFirst) {
      const row = builtById.get(period.periodeId)
      if (!row) {
        toBuild.push(period)
        continue
      }
      // Another cash account list (Settings changed) means other lines: rebuild whatever the fingerprint says.
      if (row.cashHash !== cashHash) {
        toBuild.push(period)
        replaced.add(period.periodeId)
        continue
      }
      const state: BuiltPeriodState = {
        periodKey: row.periodKey,
        statsKey: row.statsKey,
        builtAtMs: toMs(row.builtAt),
        checkedAtMs: toMs(row.checkedAt),
      }
      let decision = verifyDecision({ period, built: state, isNewest: newestIds.has(period.periodeId), nowMs })
      if (decision === 'check-stats') {
        decision = statsKey(await glPeriodStats(period)) === row.statsKey ? 'keep' : 'rebuild'
        if (decision === 'keep') unchanged.push(period.periodeId)
      }
      if (decision === 'rebuild') {
        toBuild.push(period)
        replaced.add(period.periodeId)
      }
    }

    for (const [index, period] of toBuild.entries()) {
      const t0 = Date.now()
      await buildPeriod(conn, period, cashCoaIds, cashHash)
      dashLog.info(
        `cash lines snapshot ${index + 1}/${toBuild.length}: ${period.name}${replaced.has(period.periodeId) ? ' (rebuilt)' : ''} (${Math.round((Date.now() - t0) / 1000)}s)`,
      )
    }

    for (const slice of chunk(unchanged)) {
      await conn.query('UPDATE ?? SET checked_at = UTC_TIMESTAMP() WHERE period_id IN (?)', [
        dashTable(DASH_TABLES.cashPeriods),
        slice,
      ])
    }

    if (toBuild.length === 0 && stale.length === 0) return { ran: false, reason: 'nothing-to-do' }
    return {
      ran: true,
      built: toBuild.length,
      rebuilt: replaced.size,
      removed: stale.length,
      durationMs: Date.now() - started,
    }
  } finally {
    if (locked) await conn.query("SELECT RELEASE_LOCK('dash_refresh_cash')").catch(() => {})
    conn.release()
  }
}

/** One period: its lines and its marker are written in one transaction, so readers never see half a period. */
async function buildPeriod(conn: Conn, period: Period, cashCoaIds: Id[], cashHash: string): Promise<void> {
  const { gl, glDetail } = glTablesOf(period.tableName)
  const started = Date.now()
  const lines = dashTable(DASH_TABLES.cashLines)
  const marker = dashTable(DASH_TABLES.cashPeriods)

  // Taken BEFORE the lines are read: a journal that changes meanwhile shows up as a difference in the next run.
  const pKey = periodKey(period)
  const sKey = statsKey(await glPeriodStats(period))

  const hasCanceled = await glTableHasCanceledDate(gl)
  const notCanceledInner = hasCanceled ? ' AND g2.canceled_date IS NULL' : ''
  const notCanceledOuter = hasCanceled ? ' AND g.canceled_date IS NULL' : ''

  await conn.beginTransaction()
  try {
    await conn.query('DELETE FROM ?? WHERE period_id = ?', [lines, period.periodeId])
    // Same rows as the live query in cashflow.repo.ts: the lines of every posted journal that has at least one line on a
    // cash account, grouped per (journal, account, segment). The inner STRAIGHT_JOIN starts from the period, not from the
    // accounts' whole history (as in the live query; the outer select is left to the optimizer, as there).
    // COALESCE: journal_type, debet and credit may be NULL in the ERP while the snapshot columns are NOT NULL, and a strict
    // SQL mode (the MySQL 5.7 default) refuses such a row. The live query reads a missing value as 0, so 0 gives the same lines.
    // Parameters, in the order of the placeholders: lines table, cash accounts (flag), gl, gl_detail, gl, gl_detail,
    // period, cash accounts (journal filter), period.
    const [result] = await conn.query(
      `INSERT INTO ?? (period_id, gl_id, journal_type, coa_id, segment_id, is_cash, debet, credit)
       SELECT g.period_id, d.gl_id, COALESCE(g.journal_type, 0), d.coa_id, d.${SNAPSHOT_SEGMENT_COLUMN},
              MAX(CASE WHEN d.coa_id IN (?) THEN 1 ELSE 0 END), COALESCE(SUM(d.debet), 0), COALESCE(SUM(d.credit), 0)
       FROM ?? g
       JOIN ?? d ON d.gl_id = g.gl_id
       JOIN (
         SELECT DISTINCT STRAIGHT_JOIN d2.gl_id
         FROM ?? g2
         JOIN ?? d2 ON d2.gl_id = g2.gl_id
         WHERE g2.posted_status = 1${notCanceledInner} AND g2.period_id = ? AND d2.coa_id IN (?)
       ) k ON k.gl_id = g.gl_id
       WHERE g.posted_status = 1${notCanceledOuter} AND g.period_id = ?
       GROUP BY g.period_id, d.gl_id, g.journal_type, d.coa_id, d.${SNAPSHOT_SEGMENT_COLUMN}`,
      [lines, cashCoaIds, gl, glDetail, gl, glDetail, period.periodeId, cashCoaIds, period.periodeId],
    )
    const rowCount = toInt((result as { affectedRows?: number }).affectedRows)
    await conn.query(
      `INSERT INTO ?? (period_id, built_at, row_count, duration_ms, period_key, stats_key, checked_at, cash_hash)
       VALUES (?, UTC_TIMESTAMP(), ?, ?, ?, ?, UTC_TIMESTAMP(), ?)
       ON DUPLICATE KEY UPDATE built_at = VALUES(built_at), row_count = VALUES(row_count), duration_ms = VALUES(duration_ms),
                               period_key = VALUES(period_key), stats_key = VALUES(stats_key), checked_at = VALUES(checked_at),
                               cash_hash = VALUES(cash_hash)`,
      [marker, period.periodeId, rowCount, Date.now() - started, pKey, sKey, cashHash],
    )
    await conn.commit()
  } catch (error) {
    await conn.rollback().catch(() => {})
    throw error
  }
}
