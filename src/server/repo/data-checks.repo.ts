import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { D } from '~/lib/finance/money'
import { addDays, todayIn } from '~/lib/format/date'
import { env } from '~/server/env'
import type { Id, IsoDate, Money, Period } from '~/lib/finance/types'

export type QCheckSummary = {
  count: number
  amount: Money | null
}

export async function checkQ1b(locIds: Id[] | 'all'): Promise<QCheckSummary> {
  if (locIds !== 'all' && locIds.length === 0) {
    return { count: 0, amount: '0.00' }
  }

  const locClause =
    locIds !== 'all' ? sql`AND c.location_id IN (${inList(locIds.slice(0, 1000))})` : sql``

  const query = sql`
    SELECT COUNT(*) AS n, COALESCE(SUM(c.amount), 0) AS amount
    FROM ap_ar_card c
    LEFT JOIN ap_ar_card_detail d ON d.invoice_id = c.ap_ar_card_id
    WHERE c.module_type = 0
      AND c.transaction_type = 1
      AND c.payment_status = 2
      AND d.ap_ar_card_detail_id IS NULL
      ${locClause}
  `

  const result = await rows<{ n: number | string; amount: number | string }>(query)
  const n = Number(result[0]?.n || 0)
  const amount = D(result[0]?.amount || 0).toFixed(2)
  return { count: n, amount }
}

export async function checkQ7(locIds: Id[] | 'all'): Promise<number> {
  if (locIds !== 'all' && locIds.length === 0) return 0

  const locClause =
    locIds !== 'all' ? sql`AND c.location_id IN (${inList(locIds.slice(0, 1000))})` : sql``

  const queryVendor = sql`
    SELECT COUNT(*) AS n
    FROM ap_ar_card c
    LEFT JOIN vendor v ON v.vendor_id = c.owner_id
    WHERE c.module_type = 0
      AND c.owner_id IS NOT NULL AND c.owner_id != ''
      AND v.vendor_id IS NULL
      ${locClause}
  `

  const queryCustomer = sql`
    SELECT COUNT(*) AS n
    FROM ap_ar_card c
    LEFT JOIN customer cust ON cust.customer_id = c.owner_id
    WHERE c.module_type = 1
      AND c.owner_id IS NOT NULL AND c.owner_id != ''
      AND cust.customer_id IS NULL
      ${locClause}
  `

  const [resV, resC] = await Promise.all([
    rows<{ n: number | string }>(queryVendor),
    rows<{ n: number | string }>(queryCustomer),
  ])

  return Number(resV[0]?.n || 0) + Number(resC[0]?.n || 0)
}

export async function checkQ8(): Promise<number> {
  const query = sql`
    SELECT COUNT(*) AS n
    FROM ap_ar_card c
    LEFT JOIN pos_location l ON l.location_id = c.location_id
    WHERE c.location_id IS NOT NULL AND c.location_id != ''
      AND l.location_id IS NULL
  `

  const res = await rows<{ n: number | string }>(query)
  return Number(res[0]?.n || 0)
}

export async function checkQ9(
  segCol: string,
  segIds: Id[] | 'all',
  asOfDate?: IsoDate,
): Promise<QCheckSummary> {
  if (segIds !== 'all' && segIds.length === 0) {
    return { count: 0, amount: '0.00' }
  }

  const baseDate = asOfDate || todayIn(env.APP_TIMEZONE)
  const cutoffPast = addDays(baseDate, -7)
  const cutoffFuture = addDays(baseDate, 1)

  const validSegCol = /^segment([1-9]|1[0-5])_id$/.test(segCol) ? segCol : 'segment1_id'
  const segIdent = sql.identifier(validSegCol)

  const segClause =
    segIds !== 'all'
      ? sql`AND bp.${segIdent} IN (${inList(segIds.slice(0, 1000))})`
      : sql``

  const query = sql`
    SELECT COUNT(*) AS n, COALESCE(SUM(bp.amount), 0) AS amount
    FROM bank_payment bp
    WHERE bp.type IN (1, 2)
      AND bp.status = 0
      AND (bp.transaction_date < ${cutoffPast} OR bp.transaction_date >= ${cutoffFuture})
      ${segClause}
  `

  const result = await rows<{ n: number | string; amount: number | string }>(query)
  const n = Number(result[0]?.n || 0)
  const amount = D(result[0]?.amount || 0).toFixed(2)
  return { count: n, amount }
}

export async function checkUnpostedJournals(periods: Period[]): Promise<number> {
  if (periods.length === 0) return 0

  const periodIds = periods.map((p) => p.periodeId)
  const query = sql`
    SELECT COUNT(*) AS n
    FROM gl g
    WHERE g.posted_status = 0
      AND g.period_id IN (${inList(periodIds.slice(0, 1000))})
  `

  const result = await rows<{ n: number | string }>(query)
  return Number(result[0]?.n || 0)
}
