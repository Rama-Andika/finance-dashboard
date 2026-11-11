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

/**
 * `company.name` of the company row, as the database holds it; null when there is no company row or no name.
 * Only this one column is read. The name is shown to signed-in users and is never written to a log.
 */
export async function readCompanyNameRaw(): Promise<string | null> {
  const result = await rows<{ companyName: string | null }>(sql`
    SELECT name AS companyName
    FROM company
    ORDER BY company_id
    LIMIT 1
  `)
  return result[0]?.companyName ?? null
}
