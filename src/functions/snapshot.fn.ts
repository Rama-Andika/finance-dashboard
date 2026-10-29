import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import type { SnapshotInfo } from '~/server/dash/snapshot'

export type { SnapshotInfo }

/** When the AP/AR snapshot was last refreshed (null = no snapshot, the live ERP queries are used). */
export const getSnapshotInfoFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<SnapshotInfo | null> => {
    const { apArSnapshotInfo } = await import('~/server/dash/snapshot')
    return apArSnapshotInfo()
  })
