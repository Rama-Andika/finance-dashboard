import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import type { SnapshotInfo } from '~/server/dash/snapshot'
import type { SnapshotProblem } from '~/lib/finance/ap-ar/snapshot-state'

export type { SnapshotInfo, SnapshotProblem }

export type SnapshotState = {
  info: SnapshotInfo | null
  /** Set when the numbers are NOT served from a snapshot (the slow live ERP queries are used instead) */
  problem: SnapshotProblem | null
  /** The snapshot exists but is old: built for an earlier day, or not refreshed for several intervals */
  stale: boolean
}

/** State of the AP/AR snapshot, for the "Data as of ..." label and its warnings. */
export const getSnapshotInfoFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<SnapshotState> => {
    const { apArSnapshotInfo, apArSnapshotProblem } = await import('~/server/dash/snapshot')
    const { isSnapshotStale } = await import('~/lib/finance/ap-ar/snapshot-state')
    const { env } = await import('~/server/env')
    const { todayIn } = await import('~/lib/format/date')
    const info = await apArSnapshotInfo()
    const today = env.APP_TODAY ?? todayIn(env.APP_TIMEZONE)
    return {
      info,
      problem: await apArSnapshotProblem(),
      stale: info ? isSnapshotStale(info, Date.now(), today, env.DASH_REFRESH_MINUTES) : false,
    }
  })
