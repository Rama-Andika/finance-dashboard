import '@tanstack/react-start/server-only'
import { sql, type SQL } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { memo } from '~/server/cache'

/** The ERP schema does not change while the server runs; one hour keeps the check cheap and still notices an upgrade. */
const COLUMN_CHECK_TTL_MS = 60 * 60 * 1000

/**
 * True when the given GL header table has a `canceled_date` column.
 * Some ERP versions (and the legacy ERP source) have no such column, so the "not canceled" filter must be optional.
 * `glTable` comes from `glTablesOf` (whitelisted names) and is passed as a query parameter anyway.
 */
export function glTableHasCanceledDate(glTable: string): Promise<boolean> {
  return memo(`glcol:canceled_date:${glTable}`, COLUMN_CHECK_TTL_MS, async () => {
    const result = await rows<{ n: number | string }>(sql`
      SELECT COUNT(*) AS n
      FROM information_schema.columns
      WHERE table_schema = DATABASE()
        AND table_name = ${glTable}
        AND column_name = 'canceled_date'
    `)
    return Number(result[0]?.n ?? 0) > 0
  })
}

/** `AND <alias>.canceled_date IS NULL` when the table has the column, otherwise an empty fragment. */
export async function notCanceledClause(glTable: string, alias: string): Promise<SQL> {
  return (await glTableHasCanceledDate(glTable)) ? sql`AND ${sql.identifier(alias)}.canceled_date IS NULL` : sql``
}
