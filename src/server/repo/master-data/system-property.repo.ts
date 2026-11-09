import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { inList } from '~/server/db/in-list'
import { rows } from '~/server/db/query'

/**
 * The values of ERP system properties (`system_main.name` and `valueprop`) by name. A property that does not exist, or
 * has no value, is not in the answer. Read only; the dashboard's own setting row is handled in settings.repo.ts.
 */
export async function readSystemProperties(names: readonly string[]): Promise<Map<string, string>> {
  if (names.length === 0) return new Map()
  const result = await rows<{ name: string; value: string | null }>(sql`
    SELECT name AS name, valueprop AS value
    FROM system_main
    WHERE name IN (${inList(names)})
  `)
  const values = new Map<string, string>()
  for (const r of result) {
    if (r.value !== null && r.value !== undefined) values.set(String(r.name), String(r.value))
  }
  return values
}
