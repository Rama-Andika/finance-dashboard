import '@tanstack/react-start/server-only'
import { env } from '~/server/env'
import { todayIn } from '~/lib/format/date'
import { dashMigrationStatus, runDashMigrations } from './migrate'
import { refreshApArSnapshot } from './refresh-ap-ar'
import { refreshGlMonthlySnapshot } from './gl-snapshot'
import { apArSnapshotInfo, warmApArSnapshot } from './snapshot'

declare global {
  // eslint-disable-next-line no-var
  var __dashScheduler: { started: true; running: boolean } | undefined
  // eslint-disable-next-line no-var
  var __dashSchedulerRetryAt: number | undefined
}

function today(): string {
  return env.APP_TODAY ?? todayIn(env.APP_TIMEZONE)
}

async function tick(state: { running: boolean }): Promise<void> {
  if (state.running) return
  state.running = true
  try {
    const status = await dashMigrationStatus()
    if (status.pending.length > 0) {
      console.warn(`dash: ${status.pending.length} migration(s) pending (${status.pending.join(', ')}); run "npm run db:dash:migrate". Snapshot refresh skipped.`)
      return
    }
    const result = await refreshApArSnapshot(today())
    await warmApArSnapshot()
    // Closed GL periods: cheap when nothing is new, a few seconds to minutes per new period otherwise
    const gl = await refreshGlMonthlySnapshot()
    if (gl.ran) console.log(`dash: GL snapshot built ${gl.built} period(s), removed ${gl.removed} in ${Math.round(gl.durationMs / 1000)}s`)
    if (result.ran) {
      console.log(`dash: AP/AR snapshot refreshed in ${Math.round(result.durationMs / 1000)}s (${result.openRows} open invoices, ${result.unallocatedRows} unallocated)`)
    }
  } catch (error) {
    console.error('dash: snapshot refresh failed:', error instanceof Error ? error.message : error)
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
      console.error('dash: scheduler could not start:', error instanceof Error ? error.message : error)
      globalThis.__dashScheduler = undefined
      globalThis.__dashSchedulerRetryAt = Date.now() + 60_000
    }
  })()
}
