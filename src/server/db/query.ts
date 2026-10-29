import '@tanstack/react-start/server-only'
import type { SQL } from 'drizzle-orm'
import { db } from './client'

/** Run a parameterized query and return the SELECT result rows. */
export async function rows<T>(query: SQL): Promise<T[]> {
  const result = (await db.execute(query)) as unknown as [T[], unknown]
  return result[0] || []
}

/** Parameterized `IN (...)` helper. Callers must make sure the list is not empty. */
export { inList } from './in-list'
