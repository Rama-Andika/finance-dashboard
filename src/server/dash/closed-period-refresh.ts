import '@tanstack/react-start/server-only'
import { refreshPool } from '~/server/db/refresh-pool'
import { chunk } from '~/server/db/chunk'
import { listPeriods } from '~/server/repo/master-data/periods.repo'
import { glPeriodStatsSharedMany } from '~/server/repo/gl/gl-period-stats.repo'
import {
  NEWEST_CLOSED_PERIODS,
  statsKey,
  verifyDecision,
  type BuiltPeriodState,
  type PeriodHeaderStats,
} from '~/lib/finance/period/period-fingerprint'
import type { Period } from '~/lib/core/types'
import { dashTable } from './tables'
import { dashLog } from './log'
import { prepareRefreshConnection, tryLock, unlock, type RefreshConnection } from './refresh-connection'

/**
 * The part the monthly GL snapshot and the cash-lines snapshot have in common: both keep one block of rows per Closed
 * period plus a "built" marker per period, and both decide from the same fingerprint (period-fingerprint.ts) which
 * periods to drop, build or rebuild. Only the tables, the lock and the way one period is written differ.
 */
export type ClosedPeriodRefreshResult =
  | { ran: true; built: number; rebuilt: number; removed: number; durationMs: number }
  | { ran: false; reason: 'locked' | 'nothing-to-do' }

export type ClosedPeriodSpec = {
  /** How the log lines name this snapshot, for example "GL snapshot". */
  label: string
  /** Advisory lock: one run at a time, across processes. */
  lockName: string
  /** Table with the rows of every built period; its rows go when a period is no longer Closed. */
  rowsTable: string
  /** Table with one marker row per built period (fingerprint, build time, last check). */
  markerTable: string
  /**
   * A marker column that must still equal `expected`, or the period is rebuilt whatever the fingerprint says
   * (the cash-lines snapshot stores the hash of the cash account list there).
   */
  extra?: { column: string; expected: string }
}

type BuiltRow = {
  id: string
  periodKey: string | null
  statsKey: string | null
  extra: string | null
  builtAt: string | null
  checkedAt: string | null
}

const toMs = (iso: string | null): number | null => {
  if (!iso) return null
  const ms = Date.parse(iso)
  return Number.isNaN(ms) ? null : ms
}

/**
 * Keeps one closed-period snapshot in step with the ERP:
 * - drops periods that are no longer Closed (re-opened);
 * - builds every Closed period that is not in the snapshot yet, newest first;
 * - rebuilds a period whose fingerprint changed (see period-fingerprint.ts for how often each is checked).
 * `buildPeriod` writes one period (rows and marker) in one transaction. Safe to run repeatedly; one run at a time.
 */
export async function refreshClosedPeriods(
  spec: ClosedPeriodSpec,
  buildPeriod: (conn: RefreshConnection, period: Period) => Promise<void>,
): Promise<ClosedPeriodRefreshResult> {
  const started = Date.now()
  const conn = await refreshPool.getConnection()
  let locked = false
  try {
    await prepareRefreshConnection(conn)
    locked = await tryLock(conn, spec.lockName)
    if (!locked) return { ran: false, reason: 'locked' }

    const periods = await listPeriods()
    const closed = periods.filter((p) => p.status === 'Closed')
    const closedIds = new Set(closed.map((p) => p.periodeId))

    const [builtRows] = await conn.query(
      `SELECT CAST(period_id AS CHAR) AS id, period_key AS periodKey, stats_key AS statsKey${spec.extra ? ', ?? AS extra' : ', NULL AS extra'},
              DATE_FORMAT(built_at, '%Y-%m-%dT%H:%i:%sZ') AS builtAt,
              DATE_FORMAT(checked_at, '%Y-%m-%dT%H:%i:%sZ') AS checkedAt
       FROM ??`,
      [...(spec.extra ? [spec.extra.column] : []), dashTable(spec.markerTable)],
    )
    const builtById = new Map((builtRows as BuiltRow[]).map((r) => [String(r.id), r] as const))

    // A period that is no longer Closed was re-opened: its snapshot rows may be outdated.
    const stale = Array.from(builtById.keys()).filter((id) => !closedIds.has(id))
    for (const slice of chunk(stale)) {
      await conn.query('DELETE FROM ?? WHERE period_id IN (?)', [dashTable(spec.rowsTable), slice])
      await conn.query('DELETE FROM ?? WHERE period_id IN (?)', [dashTable(spec.markerTable), slice])
    }

    // Newest first: the months that are asked for most are available first.
    const newestFirst = [...closed].sort((a, b) => b.startDate.localeCompare(a.startDate))
    const newestIds = new Set(newestFirst.slice(0, NEWEST_CLOSED_PERIODS).map((p) => p.periodeId))
    const nowMs = Date.now()

    // First decide for every period, without waiting for the ERP: the periods whose journal counts must be compared
    // are collected, so they can be read together (one query per GL table instead of one per period).
    type PeriodDecision = 'build' | 'rebuild' | 'check-stats' | 'keep'
    const decisions: Array<{ period: Period; row: BuiltRow | undefined; decision: PeriodDecision }> = []
    for (const period of newestFirst) {
      const row = builtById.get(period.periodeId)
      if (!row) {
        decisions.push({ period, row, decision: 'build' })
      } else if (spec.extra && row.extra !== spec.extra.expected) {
        decisions.push({ period, row, decision: 'rebuild' })
      } else {
        const state: BuiltPeriodState = {
          periodKey: row.periodKey,
          statsKey: row.statsKey,
          builtAtMs: toMs(row.builtAt),
          checkedAtMs: toMs(row.checkedAt),
        }
        const decision = verifyDecision({ period, built: state, isNewest: newestIds.has(period.periodeId), nowMs })
        decisions.push({ period, row, decision })
      }
    }

    const toCheck = decisions.filter((d) => d.decision === 'check-stats').map((d) => d.period)
    const counts = toCheck.length > 0 ? await glPeriodStatsSharedMany(toCheck) : new Map<string, PeriodHeaderStats>()

    const toBuild: Period[] = []
    const replaced = new Set<string>()
    const unchanged: string[] = []
    for (const { period, row, decision } of decisions) {
      let final = decision
      if (final === 'check-stats') {
        const found = counts.get(period.periodeId)
        final = found !== undefined && row !== undefined && statsKey(found) === row.statsKey ? 'keep' : 'rebuild'
        if (final === 'keep') unchanged.push(period.periodeId)
      }
      if (final === 'build') {
        toBuild.push(period)
      } else if (final === 'rebuild') {
        toBuild.push(period)
        replaced.add(period.periodeId)
      }
    }

    for (const [index, period] of toBuild.entries()) {
      const t0 = Date.now()
      await buildPeriod(conn, period)
      dashLog.info(
        `${spec.label} ${index + 1}/${toBuild.length}: ${period.name}${replaced.has(period.periodeId) ? ' (rebuilt)' : ''} (${Math.round((Date.now() - t0) / 1000)}s)`,
      )
    }

    // Periods whose journal counts were compared and found equal only move their "checked" time.
    for (const slice of chunk(unchanged)) {
      await conn.query('UPDATE ?? SET checked_at = UTC_TIMESTAMP() WHERE period_id IN (?)', [
        dashTable(spec.markerTable),
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
    if (locked) await unlock(conn, spec.lockName)
    conn.release()
  }
}
