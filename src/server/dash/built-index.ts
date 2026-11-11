import '@tanstack/react-start/server-only'
import { memo } from '~/server/cache'
import { dashLog } from './log'

/** MySQL / MariaDB error number for "table does not exist" (ER_NO_SUCH_TABLE). */
const NO_SUCH_TABLE_ERRNO = 1146
/** How many `cause` links of an error are followed (Drizzle wraps the mysql2 error). */
const MAX_CAUSE_DEPTH = 5

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
 * - Any other error: written to the log and answered with an empty list too, so the caller falls back to the ERP
 *   tables as before, but the empty list is NOT remembered: the next call asks the database again.
 * `label` names the reader in the log line.
 */
export function readSnapshotIndex<K, V>(
  key: string,
  ttlMs: number,
  label: string,
  load: () => Promise<Map<K, V>>,
): Promise<Map<K, V>> {
  const remembered = memo(key, ttlMs, async () => {
    try {
      return await load()
    } catch (error) {
      if (isMissingTableError(error)) return new Map<K, V>()
      throw error
    }
  })
  return remembered.catch((error: unknown) => {
    dashLog.warn({ err: error, label }, 'snapshot index could not be read; the ERP tables are used instead')
    return new Map<K, V>()
  })
}
