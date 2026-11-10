import '@tanstack/react-start/server-only'
import type { SQL } from 'drizzle-orm'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import { env } from '~/server/env'
import { logIfSlow } from '~/server/perf'
import { db } from './client'

const dialect = new MySqlDialect()

/** Run a parameterized query and return the SELECT result rows. A query slower than SLOW_QUERY_MS is logged. */
export async function rows<T>(query: SQL): Promise<T[]> {
  const startedAt = performance.now()
  // drizzle types `execute` loosely; with mysql2 it resolves to [rows, fields]
  const result = (await db.execute(query)) as unknown as [T[], unknown]
  // The time includes any wait for a free pooled connection; `LOG_LEVEL=debug` shows those waits separately.
  logIfSlow(performance.now() - startedAt, env.SLOW_QUERY_MS, () => dialect.sqlToQuery(query).sql)
  return result[0] || []
}

/** Parameterized `IN (...)` helper. Callers must make sure the list is not empty. */
export { inList } from './in-list'
