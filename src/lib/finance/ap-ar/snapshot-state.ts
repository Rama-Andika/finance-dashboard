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
