import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'

/** system_main key of the dashboard feature flags (decision D69). */
export const FEATURE_FLAGS_KEY = 'DASHBOARD_FEATURE_FLAGS'

/**
 * The stored text of the feature flag row, or null when the row does not exist or has no text. Read only: the dashboard
 * never writes this row; the owner edits it in the database (docs/project-guide.md chapter 10.10). `name` is overridable
 * only so integration tests can use their own row instead of the real one.
 */
export async function readFeatureFlagsText(name: string = FEATURE_FLAGS_KEY): Promise<string | null> {
  const result = await rows<{ valueprop: string | null }>(sql`
    SELECT valueprop AS valueprop
    FROM system_main
    WHERE name = ${name}
    LIMIT 1
  `)
  return result[0]?.valueprop ?? null
}
