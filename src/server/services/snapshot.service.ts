import '@tanstack/react-start/server-only'
import { isSnapshotStale, manualRefreshGate, type SnapshotProblem } from '~/lib/finance/ap-ar/snapshot-state'
import { dashMigrationStatus } from '~/server/dash/migrate'
import { getRefreshJob, runRefreshCycle, type RefreshJobState } from '~/server/dash/refresh-cycle'
import { apArSnapshotInfo, apArSnapshotProblem, type SnapshotInfo } from '~/server/dash/snapshot'
import { appToday } from '~/server/context'
import { env } from '~/server/env'

export type SnapshotState = {
  info: SnapshotInfo | null
  /** Set when the numbers are NOT served from a snapshot (the slow live ERP queries are used instead) */
  problem: SnapshotProblem | null
  /** The snapshot exists but is old: built for an earlier day, or not refreshed for several intervals */
  stale: boolean
  /** The refresh job of this server process: running now, how the latest run ended, how many runs have finished */
  job: RefreshJobState
  /** False when the refresh is switched off or the snapshot tables do not exist; the "Refresh now" button is then hidden */
  canRefresh: boolean
}

/** State of the AP/AR snapshot, for the "Data as of ..." label, its warnings and the "Refresh now" button. */
export async function getSnapshotState(): Promise<SnapshotState> {
  const info = await apArSnapshotInfo()
  const today = appToday()
  const problem = await apArSnapshotProblem()
  return {
    info,
    problem,
    stale: info ? isSnapshotStale(info, Date.now(), today, env.DASH_REFRESH_MINUTES) : false,
    job: getRefreshJob(),
    canRefresh: env.DASH_REFRESH_ENABLED !== '0' && problem !== 'not-migrated',
  }
}

/** What pressing "Refresh now" led to. */
export type StartRefreshResult =
  | { status: 'started' }
  | { status: 'already-running' }
  | { status: 'cooldown'; retryAfterSeconds: number }
  | { status: 'unavailable' }

/**
 * Starts a forced refresh in the background and returns at once; the browser follows it through `getSnapshotState`.
 * Refused when the refresh is switched off or not migrated, when a run is already going, or when the snapshot was
 * rebuilt less than the cooldown ago (one rebuild serves every user).
 */
export async function startSnapshotRefresh(): Promise<StartRefreshResult> {
  if (env.DASH_REFRESH_ENABLED === '0') return { status: 'unavailable' }
  if (getRefreshJob().running) return { status: 'already-running' }

  const migrations = await dashMigrationStatus().catch(() => null)
  if (!migrations || migrations.pending.length > 0) return { status: 'unavailable' }

  const info = await apArSnapshotInfo()
  // Another server process is rebuilding right now.
  if (info?.status === 'running') return { status: 'already-running' }
  const gate = manualRefreshGate(info, Date.now())
  if (!gate.allowed) return { status: 'cooldown', retryAfterSeconds: gate.retryAfterSeconds }

  // No await between this check and the start: two presses at the same moment cannot both start a run.
  if (getRefreshJob().running) return { status: 'already-running' }
  void runRefreshCycle('manual', { force: true })
  return { status: 'started' }
}
