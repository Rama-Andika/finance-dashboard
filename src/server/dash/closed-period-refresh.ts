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
  type VerifyDecision,
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

export type BuiltRow = {
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

type PeriodDecision = 'build' | VerifyDecision

/** What to do with one Closed period, and the marker row it was decided from (none when it was never built). */
export type PeriodPlan = { period: Period; row: BuiltRow | undefined; decision: PeriodDecision }

/** The marker rows of the snapshot, by period id. */
async function readBuiltRows(conn: RefreshConnection, spec: ClosedPeriodSpec): Promise<Map<string, BuiltRow>> {
  const [builtRows] = await conn.query(
    `SELECT CAST(period_id AS CHAR) AS id, period_key AS periodKey, stats_key AS statsKey${spec.extra ? ', ?? AS extra' : ', NULL AS extra'},
            DATE_FORMAT(built_at, '%Y-%m-%dT%H:%i:%sZ') AS builtAt,
            DATE_FORMAT(checked_at, '%Y-%m-%dT%H:%i:%sZ') AS checkedAt
     FROM ??`,
    [...(spec.extra ? [spec.extra.column] : []), dashTable(spec.markerTable)],
  )
  return new Map((builtRows as BuiltRow[]).map((r) => [String(r.id), r] as const))
}

/** A period that is no longer Closed was re-opened: its snapshot rows may be outdated, so rows and marker go. */
async function dropStalePeriods(
  conn: RefreshConnection,
  spec: ClosedPeriodSpec,
  builtById: ReadonlyMap<string, BuiltRow>,
  closedIds: ReadonlySet<string>,
): Promise<string[]> {
  const stale = Array.from(builtById.keys()).filter((id) => !closedIds.has(id))
  for (const slice of chunk(stale)) {
    await conn.query('DELETE FROM ?? WHERE period_id IN (?)', [dashTable(spec.rowsTable), slice])
    await conn.query('DELETE FROM ?? WHERE period_id IN (?)', [dashTable(spec.markerTable), slice])
  }
  return stale
}

function decideOne(
  period: Period,
  row: BuiltRow | undefined,
  isNewest: boolean,
  extra: ClosedPeriodSpec['extra'],
  nowMs: number,
): PeriodDecision {
  if (!row) return 'build'
  if (extra && row.extra !== extra.expected) return 'rebuild'
  const built: BuiltPeriodState = {
    periodKey: row.periodKey,
    statsKey: row.statsKey,
    builtAtMs: toMs(row.builtAt),
    checkedAtMs: toMs(row.checkedAt),
  }
  return verifyDecision({ period, built, isNewest, nowMs })
}

/**
 * Decides for every Closed period (given newest first) without asking the ERP anything: build it, rebuild it, keep it,
 * or compare its journal counts first ('check-stats').
 */
export function planPeriods(input: {
  newestFirst: readonly Period[]
  builtById: ReadonlyMap<string, BuiltRow>
  extra: ClosedPeriodSpec['extra']
  nowMs: number
}): PeriodPlan[] {
  const newestIds = new Set(input.newestFirst.slice(0, NEWEST_CLOSED_PERIODS).map((p) => p.periodeId))
  return input.newestFirst.map((period) => {
    const row = input.builtById.get(period.periodeId)
    const isNewest = newestIds.has(period.periodeId)
    return { period, row, decision: decideOne(period, row, isNewest, input.extra, input.nowMs) }
  })
}

/** A 'check-stats' plan becomes 'keep' when the journal counts still match the marker, 'rebuild' otherwise. */
function finalDecision(plan: PeriodPlan, counts: ReadonlyMap<string, PeriodHeaderStats>): 'build' | 'rebuild' | 'keep' {
  if (plan.decision !== 'check-stats') return plan.decision
  const found = counts.get(plan.period.periodeId)
  return found !== undefined && plan.row !== undefined && statsKey(found) === plan.row.statsKey ? 'keep' : 'rebuild'
}

/**
 * What to build (newest first, as planned), which of those are rebuilds, and which periods were compared and found
 * unchanged. A period kept at once, without a comparison, is in none of the three.
 */
export function settlePlans(
  plans: readonly PeriodPlan[],
  counts: ReadonlyMap<string, PeriodHeaderStats>,
): { toBuild: Period[]; replaced: Set<string>; unchanged: string[] } {
  const toBuild: Period[] = []
  const replaced = new Set<string>()
  const unchanged: string[] = []
  for (const plan of plans) {
    const final = finalDecision(plan, counts)
    if (final === 'keep') {
      if (plan.decision === 'check-stats') unchanged.push(plan.period.periodeId)
    } else {
      toBuild.push(plan.period)
      if (final === 'rebuild') replaced.add(plan.period.periodeId)
    }
  }
  return { toBuild, replaced, unchanged }
}

async function buildPeriods(
  conn: RefreshConnection,
  spec: ClosedPeriodSpec,
  buildPeriod: (conn: RefreshConnection, period: Period) => Promise<void>,
  toBuild: readonly Period[],
  replaced: ReadonlySet<string>,
): Promise<void> {
  for (const [index, period] of toBuild.entries()) {
    const t0 = Date.now()
    await buildPeriod(conn, period)
    dashLog.info(
      `${spec.label} ${index + 1}/${toBuild.length}: ${period.name}${replaced.has(period.periodeId) ? ' (rebuilt)' : ''} (${Math.round((Date.now() - t0) / 1000)}s)`,
    )
  }
}

/** Periods whose journal counts were compared and found equal only move their "checked" time. */
async function markChecked(
  conn: RefreshConnection,
  spec: ClosedPeriodSpec,
  periodIds: readonly string[],
): Promise<void> {
  for (const slice of chunk(periodIds)) {
    await conn.query('UPDATE ?? SET checked_at = UTC_TIMESTAMP() WHERE period_id IN (?)', [
      dashTable(spec.markerTable),
      slice,
    ])
  }
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

    const closed = (await listPeriods()).filter((p) => p.status === 'Closed')
    const builtById = await readBuiltRows(conn, spec)
    const stale = await dropStalePeriods(conn, spec, builtById, new Set(closed.map((p) => p.periodeId)))

    // Newest first: the months that are asked for most are available first.
    const newestFirst = [...closed].sort((a, b) => b.startDate.localeCompare(a.startDate))

    const plans = planPeriods({ newestFirst, builtById, extra: spec.extra, nowMs: Date.now() })
    // The periods whose journal counts must be compared are read together: one query per GL table, not one per period.
    const toCheck = plans.filter((p) => p.decision === 'check-stats').map((p) => p.period)
    const counts = toCheck.length > 0 ? await glPeriodStatsSharedMany(toCheck) : new Map<string, PeriodHeaderStats>()
    const { toBuild, replaced, unchanged } = settlePlans(plans, counts)

    await buildPeriods(conn, spec, buildPeriod, toBuild, replaced)
    await markChecked(conn, spec, unchanged)

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
