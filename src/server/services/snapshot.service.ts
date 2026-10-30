import '@tanstack/react-start/server-only'
import { isSnapshotStale, type SnapshotProblem } from '~/lib/finance/ap-ar/snapshot-state'
import { apArSnapshotInfo, apArSnapshotProblem, type SnapshotInfo } from '~/server/dash/snapshot'
import { appToday } from '~/server/context'
import { env } from '~/server/env'

export type SnapshotState = {
  info: SnapshotInfo | null
  /** Set when the numbers are NOT served from a snapshot (the slow live ERP queries are used instead) */
  problem: SnapshotProblem | null
  /** The snapshot exists but is old: built for an earlier day, or not refreshed for several intervals */
  stale: boolean
}

/** State of the AP/AR snapshot, for the "Data as of ..." label and its warnings. */
export async function getSnapshotState(): Promise<SnapshotState> {
  const info = await apArSnapshotInfo()
  const today = appToday()
  return {
    info,
    problem: await apArSnapshotProblem(),
    stale: info ? isSnapshotStale(info, Date.now(), today, env.DASH_REFRESH_MINUTES) : false,
  }
}
