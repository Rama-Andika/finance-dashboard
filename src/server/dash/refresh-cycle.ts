import '@tanstack/react-start/server-only'
import { env } from '~/server/env'
import { errorText } from '~/server/log'
import { todayIn } from '~/lib/format/date'
import { clearCache } from '~/server/cache'
import { dashLog } from './log'
import { PERIOD_STATS_CACHE_PREFIX } from './tables'
import { createStepTimer, formatDuration, formatSteps, type StepTiming } from './step-timer'
import { dashMigrationStatus } from './migrate'
import { refreshApArSnapshot } from './refresh-ap-ar'
import { refreshGlMonthlySnapshot } from './gl-snapshot'
import { refreshApArHistSnapshots } from './hist-ap-ar'
import { warmApArSnapshot } from './snapshot'
import { clearCachesAfterPeriodChange } from './invalidate'
import { refreshCashLinesSnapshot } from './cash-lines-build'
import { currentCashAccountIds } from '~/server/services/shared/cash-accounts'

/** Who started a run: the timer in the server process, or a user pressing "Refresh now". */
export type RefreshSource = 'scheduler' | 'manual'

/** What the sidebar needs to know about the refresh job of THIS server process. */
export type RefreshJobState = {
  running: boolean
  /** How the latest finished run ended; null until one has finished */
  lastOk: boolean | null
  /** Runs that finished since the process started; the browser compares it to see that its own run is over */
  finishedRuns: number
}

export type RefreshCycleOutcome =
  { ran: true; ok: boolean } | { ran: false; reason: 'already-running' | 'migrations-pending' }

// Module state lives on globalThis so a hot reload does not create a second job state (`var` is required to declare it).
declare global {
  var __dashRefreshJob: RefreshJobState | undefined
}

/** A run that did nothing in a few seconds is not worth a line; a manual one (somebody is waiting) always is. */
const SUMMARY_MIN_MS = 5_000

/** One line per run worth reading: where the time went, step by step. */
function logCycleSummary(source: RefreshSource, steps: readonly StepTiming[], totalMs: number, ok: boolean): void {
  if (source !== 'manual' && ok && totalMs < SUMMARY_MIN_MS) return
  dashLog.info(
    `refresh cycle (${source}) ${ok ? 'finished' : 'finished with errors'} in ${formatDuration(totalMs)}: ${formatSteps(steps)}`,
  )
}

/** Month-end AP/AR history: months built per run, so the regular refresh is never held up for long. */
const HIST_MAX_BUILDS_PER_RUN = 1

function today(): string {
  return env.APP_TODAY ?? todayIn(env.APP_TIMEZONE)
}

function jobState(): RefreshJobState {
  globalThis.__dashRefreshJob ??= { running: false, lastOk: null, finishedRuns: 0 }
  return globalThis.__dashRefreshJob
}

/** A copy of the job state, safe to hand to the browser. */
export function getRefreshJob(): RefreshJobState {
  return { ...jobState() }
}

/**
 * One refresh run: the AP/AR snapshot, the monthly GL snapshot for Closed periods, then the month-end AP/AR history.
 * The scheduler and the "Refresh now" button both call this, so they behave the same.
 * One run at a time per process; the advisory lock inside each step keeps other processes apart.
 * `force` rebuilds the AP/AR snapshot even when the ERP fingerprint looks unchanged.
 * Never throws: a failure is logged and recorded in the job state.
 */
export async function runRefreshCycle(
  source: RefreshSource,
  options: { force: boolean },
): Promise<RefreshCycleOutcome> {
  const job = jobState()
  // No await before this flag is set: two calls in the same tick cannot both start.
  if (job.running) return { ran: false, reason: 'already-running' }
  job.running = true

  const startedAt = Date.now()
  // A manual run has somebody waiting for it: say which step is running, so the log shows where a long wait is.
  const timer = createStepTimer(
    source === 'manual' ? { onStart: (name) => dashLog.info(`manual refresh: ${name} started`) } : {},
  )
  let migrationsPending = false
  let ok = true
  try {
    const status = await dashMigrationStatus()
    if (status.pending.length > 0) {
      migrationsPending = true
      dashLog.warn(
        `${status.pending.length} migration(s) pending (${status.pending.join(', ')}); run "npm run db:dash:migrate". Snapshot refresh skipped.`,
      )
    } else {
      if (source === 'manual') dashLog.info('manual snapshot refresh started')
      const result = await timer.time('AP/AR snapshot', () => refreshApArSnapshot(today(), { force: options.force }))
      if (result.ran) {
        dashLog.info(
          `AP/AR snapshot refreshed in ${formatDuration(result.durationMs)} (${result.openRows} open invoices, ${result.unallocatedRows} unallocated): ${formatSteps(result.steps)}`,
        )
      }
      await timer.time('warm invoice lists', () => warmApArSnapshot())
      // Closed GL periods: cheap when nothing is new, a few seconds to minutes per new period otherwise
      const gl = await timer.time('GL snapshot', () => refreshGlMonthlySnapshot())
      if (gl.ran) {
        dashLog.info(
          `GL snapshot built ${gl.built} period(s) (${gl.rebuilt} rebuilt), removed ${gl.removed} in ${Math.round(gl.durationMs / 1000)}s`,
        )
        // A period that was rebuilt or dropped may have served older numbers: forget what was derived from it.
        if (gl.rebuilt > 0 || gl.removed > 0) clearCachesAfterPeriodChange()
      }
      // Lines of the cash journals of Closed periods (feeds Cash Flow, Runway and Expense Paid).
      // A failure here is recorded but does not stop the steps after it: the live ERP query still answers, only slower.
      try {
        const cash = await timer.time('cash lines snapshot', async () =>
          refreshCashLinesSnapshot(await currentCashAccountIds()),
        )
        if (cash.ran) {
          dashLog.info(
            `cash lines snapshot built ${cash.built} period(s) (${cash.rebuilt} rebuilt), removed ${cash.removed} in ${Math.round(cash.durationMs / 1000)}s`,
          )
          if (cash.rebuilt > 0 || cash.removed > 0) clearCachesAfterPeriodChange()
        }
      } catch (error) {
        ok = false
        dashLog.error(`cash lines snapshot failed (the live query is used meanwhile): ${errorText(error)}`)
      }
      // Month-end AP/AR history: one month per run (the first fill takes a few runs; `npm run dash:refresh-hist` does it at once)
      const hist = await timer.time('AP/AR history', () =>
        refreshApArHistSnapshots(today(), { maxBuilds: HIST_MAX_BUILDS_PER_RUN }),
      )
      if (hist.ran) {
        clearCache('dash:ap-ar:hist')
        dashLog.info(
          `AP/AR history built ${hist.built.length} month(s), removed ${hist.pruned} in ${Math.round(hist.durationMs / 1000)}s`,
        )
      }
      // The person who pressed "Refresh now" expects fresh numbers, not an answer kept for the stale window.
      if (source === 'manual') {
        clearCache('metric:')
        // ... and its period checks look at the ERP again instead of reusing the counts of the previous run
        clearCache(PERIOD_STATS_CACHE_PREFIX)
      }
    }
  } catch (error) {
    ok = false
    dashLog.error(`snapshot refresh failed: ${errorText(error)}`)
  } finally {
    job.running = false
    if (!migrationsPending) logCycleSummary(source, timer.steps, Date.now() - startedAt, ok)
    if (!migrationsPending) {
      job.lastOk = ok
      job.finishedRuns += 1
    }
  }
  return migrationsPending ? { ran: false, reason: 'migrations-pending' } : { ran: true, ok }
}
