/** Why the numbers are not coming from a (fresh) snapshot, shown to the user. */
export type SnapshotProblem = 'not-migrated' | 'not-refreshed' | 'disabled'

/**
 * A snapshot is stale when it describes an earlier day than today, or when it was last verified against the ERP longer ago than
 * three refresh intervals (at least 30 minutes), i.e. refreshes have been failing or the job is not running.
 */
export function isSnapshotStale(
  snapshot: { checkedAt: string; asOfDate: string },
  nowMs: number,
  today: string,
  intervalMinutes: number,
): boolean {
  if (snapshot.asOfDate < today) return true
  const limitMs = Math.max(3 * intervalMinutes, 30) * 60_000
  return nowMs - Date.parse(snapshot.checkedAt) > limitMs
}

/** Fewest milliseconds between two manual rebuilds. One rebuild serves every user, so a second press right after it adds nothing. */
export const MANUAL_REFRESH_COOLDOWN_MS = 2 * 60_000

/** How often the sidebar asks for the snapshot state while nothing is being refreshed. */
export const SNAPSHOT_POLL_IDLE_MS = 60_000

/** How often it asks while a refresh is running, so the result shows up within seconds. */
export const SNAPSHOT_POLL_RUNNING_MS = 3_000

export type ManualRefreshGate = { allowed: true } | { allowed: false; retryAfterSeconds: number }

/**
 * Whether a manual refresh may start now. It is refused when the snapshot was really rebuilt (`refreshedAt`) less than
 * the cooldown ago. A snapshot that is missing, or whose latest attempt did not end well, can be rebuilt right away.
 */
export function manualRefreshGate(
  snapshot: { status: 'ok' | 'running' | 'failed'; refreshedAt: string } | null,
  nowMs: number,
  cooldownMs = MANUAL_REFRESH_COOLDOWN_MS,
): ManualRefreshGate {
  if (!snapshot || snapshot.status !== 'ok') return { allowed: true }
  const waitMs = cooldownMs - (nowMs - Date.parse(snapshot.refreshedAt))
  // An unreadable time (NaN) must never block the button.
  if (Number.isNaN(waitMs) || waitMs <= 0) return { allowed: true }
  return { allowed: false, retryAfterSeconds: Math.ceil(waitMs / 1000) }
}

/** The part of the snapshot state that says whether a refresh is in progress. */
export type SnapshotProgress = {
  info: { status: 'ok' | 'running' | 'failed' } | null
  job: { running: boolean }
}

/** True while a refresh runs: in this server process (`job`) or in another one (the status row of the snapshot). */
export function isSnapshotRefreshing(state: SnapshotProgress | undefined): boolean {
  return state !== undefined && (state.job.running || state.info?.status === 'running')
}

/** Milliseconds until the sidebar asks for the snapshot state again. */
export function snapshotPollInterval(state: SnapshotProgress | undefined): number {
  return isSnapshotRefreshing(state) ? SNAPSHOT_POLL_RUNNING_MS : SNAPSHOT_POLL_IDLE_MS
}
