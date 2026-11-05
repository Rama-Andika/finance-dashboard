import '@tanstack/react-start/server-only'
import type { refreshPool } from '~/server/db/refresh-pool'

/** A connection taken from the refresh pool. */
export type RefreshConnection = Awaited<ReturnType<typeof refreshPool.getConnection>>

/**
 * Long scans are expected in a refresh step; the per-statement limits meant for report queries do not apply to it.
 * Each variable exists on one server flavor only (MySQL or MariaDB), so a refusal is ignored.
 */
export async function prepareRefreshConnection(conn: RefreshConnection): Promise<void> {
  await conn.query('SET SESSION max_execution_time = 0').catch(() => {})
  await conn.query('SET SESSION max_statement_time = 0').catch(() => {})
}

/** Takes the named advisory lock without waiting; false when another process (or step) holds it. */
export async function tryLock(conn: RefreshConnection, name: string): Promise<boolean> {
  const [lockRows] = await conn.query('SELECT GET_LOCK(?, 0) AS got', [name])
  return Number((lockRows as Array<{ got: number }>)[0]?.got) === 1
}

/** Releases a lock taken with `tryLock`; a failure here must never hide the result of the step. */
export async function unlock(conn: RefreshConnection, name: string): Promise<void> {
  await conn.query('SELECT RELEASE_LOCK(?)', [name]).catch(() => {})
}
