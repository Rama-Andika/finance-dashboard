import '@tanstack/react-start/server-only'
import { env } from '~/server/env'
import { dashLog } from './log'
import { errorText } from '~/server/log'
import { todayIn } from '~/lib/format/date'
import { dashMigrationStatus, runDashMigrations } from './migrate'
import { refreshApArSnapshot } from './refresh-ap-ar'
import { refreshGlMonthlySnapshot } from './gl-snapshot'
import { refreshApArHistSnapshots } from './hist-ap-ar'
import { clearCache } from '~/server/cache'
import { apArSnapshotInfo, warmApArSnapshot } from './snapshot'

// Module state lives on globalThis so a hot reload does not start a second scheduler (`var` is required to declare it).
declare global {
  var __dashScheduler: { started: true; running: boolean } | undefined
  var __dashSchedulerRetryAt: number | undefined
}

/** Month-end AP/AR history: months built per run, so the regular refresh is never held up for long. */
const HIST_MAX_BUILDS_PER_TICK = 1

function today(): string {
  return env.APP_TODAY ?? todayIn(env.APP_TIMEZONE)
}

async function tick(state: { running: boolean }): Promise<void> {
  if (state.running) return
  state.running = true
  try {
    const status = await dashMigrationStatus()
    if (status.pending.length > 0) {
      dashLog.warn(`${status.pending.length} migration(s) pending (${status.pending.join(', ')}); run "npm run db:dash:migrate". Snapshot refresh skipped.`)
      return
    }
    const result = await refreshApArSnapshot(today())
    await warmApArSnapshot()
    // Closed GL periods: cheap when nothing is new, a few seconds to minutes per new period otherwise
    const gl = await refreshGlMonthlySnapshot()
    if (gl.ran) dashLog.info(`GL snapshot built ${gl.built} period(s), removed ${gl.removed} in ${Math.round(gl.durationMs / 1000)}s`)
    // Month-end AP/AR history: one month per run (the first fill takes a few runs; `npm run dash:refresh-hist` does it at once)
    const hist = await refreshApArHistSnapshots(today(), { maxBuilds: HIST_MAX_BUILDS_PER_TICK })
    if (hist.ran) {
      clearCache('dash:ap-ar:hist')
      dashLog.info(`AP/AR history built ${hist.built.length} month(s), removed ${hist.pruned} in ${Math.round(hist.durationMs / 1000)}s`)
    }
    if (result.ran) {
      dashLog.info(`AP/AR snapshot refreshed in ${Math.round(result.durationMs / 1000)}s (${result.openRows} open invoices, ${result.unallocatedRows} unallocated)`)
    }
  } catch (error) {
    dashLog.error(`snapshot refresh failed: ${errorText(error)}`)
  } finally {
    state.running = false
  }
}

/**
 * Starts the background refresh once per server process (safe to call on every request).
 * The first run waits until the existing snapshot is as old as the refresh interval.
 */
export function ensureDashScheduler(): void {
  if (globalThis.__dashScheduler) return
  if (env.DASH_REFRESH_ENABLED === '0' || process.env.VITEST) return
  // After a failed start, wait a minute before trying again (this runs on every request).
  if (globalThis.__dashSchedulerRetryAt && Date.now() < globalThis.__dashSchedulerRetryAt) return
  const state = { started: true as const, running: false }
  globalThis.__dashScheduler = state

  const intervalMs = env.DASH_REFRESH_MINUTES * 60_000
  void (async () => {
    try {
      if (env.AUTO_MIGRATE === '1') await runDashMigrations()
      const info = await apArSnapshotInfo()
      const ageMs = info ? Date.now() - Date.parse(info.refreshedAt) : Number.POSITIVE_INFINITY
      const firstDelay = Math.max(0, intervalMs - ageMs)
      setTimeout(() => {
        void tick(state)
        setInterval(() => void tick(state), intervalMs).unref()
      }, firstDelay).unref()
    } catch (error) {
      dashLog.error(`scheduler could not start: ${errorText(error)}`)
      globalThis.__dashScheduler = undefined
      globalThis.__dashSchedulerRetryAt = Date.now() + 60_000
    }
  })()
}
