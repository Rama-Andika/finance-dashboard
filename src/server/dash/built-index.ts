import '@tanstack/react-start/server-only'
import { memo } from '~/server/cache'
import { dashLog } from './log'

/** MySQL / MariaDB error number for "table does not exist" (ER_NO_SUCH_TABLE). */
const NO_SUCH_TABLE_ERRNO = 1146
/** How many `cause` links of an error are followed (Drizzle wraps the mysql2 error). */
const MAX_CAUSE_DEPTH = 5
/**
 * After an unexpected read error the snapshot counts as absent for this long. Without the pause, an error that does
 * not go away (a refused permission, say) would repeat the failing query and the log line on every call.
 */
const FAILURE_PAUSE_MS = 10_000

/** Reader key → time until which the read is not tried again. */
const pausedUntil = new Map<string, number>()

/** Forgets every pause (tests). */
export function clearSnapshotIndexPauses(): void {
  pausedUntil.clear()
}

/** True when the error, or one of its causes, says that a table does not exist. */
export function isMissingTableError(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CAUSE_DEPTH && typeof current === 'object' && current !== null; depth++) {
    const record = current as { code?: unknown; errno?: unknown; cause?: unknown }
    if (record.code === 'ER_NO_SUCH_TABLE' || record.errno === NO_SUCH_TABLE_ERRNO) return true
    current = record.cause
  }
  return false
}

/**
 * Reads the list of periods (or month-ends) that a snapshot holds, remembered for `ttlMs`.
 * - The snapshot table does not exist yet (migration not applied): an empty list, remembered. This is a normal state.
 * - Any other error: written to the log once and answered with an empty list too, so the caller falls back to the ERP
 *   tables as before. The empty list is NOT remembered as a result, but the read is not tried again for
 *   FAILURE_PAUSE_MS: calls inside that pause answer empty at once, without a query and without a log line.
 * `label` names the reader in the log line.
 */
export async function readSnapshotIndex<K, V>(
  key: string,
  ttlMs: number,
  label: string,
  load: () => Promise<Map<K, V>>,
): Promise<Map<K, V>> {
  const pausedTill = pausedUntil.get(key)
  if (pausedTill !== undefined) {
    if (pausedTill > Date.now()) return new Map<K, V>()
    pausedUntil.delete(key)
  }

  try {
    return await memo(key, ttlMs, async () => {
      try {
        return await load()
      } catch (error) {
        if (isMissingTableError(error)) return new Map<K, V>()
        throw error
      }
    })
  } catch (error) {
    // Callers that waited for the same failed read all come here: only the first one logs and starts the pause.
    if (!pausedUntil.has(key)) {
      pausedUntil.set(key, Date.now() + FAILURE_PAUSE_MS)
      dashLog.warn({ err: error, label }, 'snapshot index could not be read; the ERP tables are used instead')
    }
    return new Map<K, V>()
  }
}
