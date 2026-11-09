import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'

/**
 * `company.end_fiscal_month` of the company row, as the database holds it (the ERP stores a 0-based month number);
 * null when there is no company row. Only this one column is read.
 */
export async function readFiscalEndMonthRaw(): Promise<number | string | null> {
  const result = await rows<{ endFiscalMonth: number | string | null }>(sql`
    SELECT end_fiscal_month AS endFiscalMonth
    FROM company
    ORDER BY company_id
    LIMIT 1
  `)
  return result[0]?.endFiscalMonth ?? null
}
