import '@tanstack/react-start/server-only'
import { createLogger } from '~/server/log'

const log = createLogger('perf')

/**
 * Logs how long `work` took, at debug level (set LOG_LEVEL=debug to see it), also when it throws. Never changes the result.
 * Measuring costs two clock reads; the line itself is only built when the level lets it through.
 */
export async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  const startedAt = performance.now()
  try {
    return await work()
  } finally {
    log.debug({ label, durationMs: Math.round(performance.now() - startedAt) }, 'timed')
  }
}

/** One line of SQL text (placeholders only, never parameter values), cut to `maxLength` characters. */
export function sqlSummary(sqlText: string, maxLength = 300): string {
  const oneLine = sqlText.replace(/\s+/g, ' ').trim()
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength)}…` : oneLine
}

/** Logs a query that took at least `thresholdMs` (0 = never). The SQL text is built only when it is needed. */
export function logIfSlow(elapsedMs: number, thresholdMs: number, sqlText: () => string): void {
  if (!(thresholdMs > 0) || elapsedMs < thresholdMs) return
  log.warn({ durationMs: Math.round(elapsedMs), sql: sqlSummary(sqlText()) }, 'slow query')
}

/** A query had to wait for a free pooled connection (debug level). */
export function logPoolWait(): void {
  log.debug({}, 'a query is waiting for a free connection (pool is full)')
}
