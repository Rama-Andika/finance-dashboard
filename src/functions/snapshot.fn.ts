import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import type { SnapshotInfo } from '~/server/dash/snapshot'
import type { SnapshotProblem } from '~/lib/finance/ap-ar/snapshot-state'
import {
  getSnapshotState,
  startSnapshotRefresh,
  type SnapshotState,
  type StartRefreshResult,
} from '~/server/services/snapshot.service'

export type { SnapshotInfo, SnapshotProblem, SnapshotState, StartRefreshResult }

/** State of the AP/AR snapshot, for the "Data as of ..." label and its warnings. */
export const getSnapshotInfoFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<SnapshotState> => getSnapshotState())

/** "Refresh now": starts a forced rebuild of the snapshot tables and answers at once; the progress shows in getSnapshotInfoFn. */
export const startSnapshotRefreshFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .handler(async (): Promise<StartRefreshResult> => startSnapshotRefresh())
