import '@tanstack/react-start/server-only'
import { createLogger } from '~/server/log'

const log = createLogger('perf')

/**
 * Per-metric timing is opt-in (PERF_LOG=1). It reads `process.env` instead of `~/server/env` so the cache, which is
 * unit tested without a database URL, can use it; env.ts validates the variable.
 */
export function perfLogEnabled(): boolean {
  return process.env.PERF_LOG === '1'
}

/** Logs how long `work` took when PERF_LOG=1, also when it throws. Never changes the result. */
export async function timed<T>(label: string, work: () => Promise<T>): Promise<T> {
  if (!perfLogEnabled()) return work()
  const startedAt = performance.now()
  try {
    return await work()
  } finally {
    log.info(`${label} ${Math.round(performance.now() - startedAt)}ms`)
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
  log.warn(`slow query ${Math.round(elapsedMs)}ms: ${sqlSummary(sqlText())}`)
}

/** A query had to wait for a free pooled connection (only logged with PERF_LOG=1). */
export function logPoolWait(): void {
  if (perfLogEnabled()) log.info('a query is waiting for a free connection (pool is full)')
}
