import '@tanstack/react-start/server-only'
import { env } from '~/server/env'
import { dashLog } from './log'
import { errorText } from '~/server/log'
import { runDashMigrations } from './migrate'
import { runRefreshCycle } from './refresh-cycle'
import { apArSnapshotInfo } from './snapshot'

// Module state lives on globalThis so a hot reload does not start a second scheduler (`var` is required to declare it).
declare global {
  var __dashScheduler: { started: true } | undefined
  var __dashSchedulerRetryAt: number | undefined
}

/**
 * Starts the background refresh once per server process (safe to call on every request).
 * The first run waits until the existing snapshot is as old as the refresh interval.
 */
export function ensureDashScheduler(): void {
  if (globalThis.__dashScheduler) return
  // A test must never start the real refresh job (it reads and writes the database), so Vitest switches it off too.
  if (env.DASH_REFRESH_ENABLED === '0' || process.env.VITEST) return
  // After a failed start, wait a minute before trying again (this runs on every request).
  if (globalThis.__dashSchedulerRetryAt && Date.now() < globalThis.__dashSchedulerRetryAt) return
  globalThis.__dashScheduler = { started: true }
  dashLog.info(`scheduler started (refresh every ${env.DASH_REFRESH_MINUTES} min)`)

  const intervalMs = env.DASH_REFRESH_MINUTES * 60_000
  void (async () => {
    try {
      if (env.AUTO_MIGRATE === '1') await runDashMigrations()
      const info = await apArSnapshotInfo()
      const ageMs = info ? Date.now() - Date.parse(info.refreshedAt) : Number.POSITIVE_INFINITY
      const firstDelay = Math.max(0, intervalMs - ageMs)
      setTimeout(() => {
        void runRefreshCycle('scheduler', { force: false })
        setInterval(() => void runRefreshCycle('scheduler', { force: false }), intervalMs).unref()
      }, firstDelay).unref()
    } catch (error) {
      dashLog.error(`scheduler could not start: ${errorText(error)}`)
      globalThis.__dashScheduler = undefined
      globalThis.__dashSchedulerRetryAt = Date.now() + 60_000
    }
  })()
}
