import '@tanstack/react-start/server-only'
import { toInt } from '~/server/db/convert'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk } from '~/server/db/chunk'
import { glTablesOf, groupPeriodsByTable } from '~/server/db/gl-tables'
import { isSegmentColumn } from '~/server/db/segment-column'
import {
  AP_BILL_TYPE,
  BANK_PAYMENT_CHANNEL_TYPES,
  BANK_PAYMENT_STATUS,
  MODULE_TYPE,
  PAYMENT_STATUS_PAID,
  intList,
} from '~/server/db/erp-codes'
import { D } from '~/lib/core/money'
import { addDays } from '~/lib/format/date'
import type { Id, IsoDate, Money, Period } from '~/lib/core/types'

export type CheckSummary = {
  count: number
  amount: Money | null
}

/** AP_PAID_NO_PAYMENT: non-trade AP bills marked paid without any settlement record. */
export async function checkApPaidWithoutPayment(locIds: Id[] | 'all'): Promise<CheckSummary> {
  if (locIds !== 'all' && locIds.length === 0) {
    return { count: 0, amount: '0.00' }
  }

  const locClause =
    locIds !== 'all' ? sql`AND c.location_id IN (${inList(locIds)})` : sql``

  const query = sql`
    SELECT COUNT(*) AS n, COALESCE(SUM(c.amount), 0) AS amount
    FROM ap_ar_card c
    WHERE c.module_type = ${MODULE_TYPE.AP}
      AND c.transaction_type = ${AP_BILL_TYPE}
      AND c.payment_status = ${PAYMENT_STATUS_PAID}
      AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.invoice_id = c.ap_ar_card_id)
      ${locClause}
  `

  const result = await rows<{ n: number | string; amount: number | string }>(query)
  const n = toInt(result[0]?.n)
  const amount = D(result[0]?.amount || 0).toFixed(2)
  return { count: n, amount }
}

/** CARD_PARTY_MISSING: AP/AR cards whose vendor or customer is not in the master list. */
export async function checkCardsWithoutParty(locIds: Id[] | 'all'): Promise<number> {
  if (locIds !== 'all' && locIds.length === 0) return 0

  const locClause =
    locIds !== 'all' ? sql`AND c.location_id IN (${inList(locIds)})` : sql``

  const queryCustomer = sql`
    SELECT COUNT(*) AS n
    FROM ap_ar_card c
    WHERE c.module_type = ${MODULE_TYPE.AR}
      AND c.owner_id IS NOT NULL AND c.owner_id != ''
      AND NOT EXISTS (SELECT 1 FROM customer cust WHERE cust.customer_id = c.owner_id)
      ${locClause}
  `

  const [apCount, resC] = await Promise.all([apCardsWithUnknownVendor(locIds), rows<{ n: number | string }>(queryCustomer)])

  return apCount + toInt(resC[0]?.n)
}

/**
 * AP cards whose owner is not in the vendor master. A row-by-row anti-join over all AP cards took ~3 minutes on the
 * demo ERP (about 2 million cards). Instead the distinct owners of all cards (a few thousand, straight from the
 * owner_id index) are checked against the vendor master first, and only the cards of the owners that are no vendor
 * are counted (~2 seconds on the same data). Same result as the anti-join.
 */
async function apCardsWithUnknownVendor(locIds: Id[] | 'all'): Promise<number> {
  const locClause = locIds !== 'all' ? sql`AND c.location_id IN (${inList(locIds)})` : sql``
  // No module_type condition inside the query: with it the optimizer walks all ~2M AP cards (~90 s). The module is
  // picked from the grouped result instead.
  const res = await rows<{ moduleType: number | string; n: number | string }>(sql`
    SELECT c.module_type AS moduleType, COUNT(*) AS n
    FROM ap_ar_card c
    WHERE c.owner_id IN (
        SELECT o.owner_id
        FROM (SELECT DISTINCT owner_id FROM ap_ar_card WHERE owner_id IS NOT NULL AND owner_id != '') o
        WHERE o.owner_id NOT IN (SELECT vendor_id FROM vendor)
      )
      ${locClause}
    GROUP BY c.module_type
  `)
  return toInt(res.find((r) => toInt(r.moduleType) === MODULE_TYPE.AP)?.n)
}

/** CARD_LOCATION_INVALID: AP/AR cards whose location is not in the location master. */
export async function checkCardsWithInvalidLocation(): Promise<number> {
  const query = sql`
    SELECT COUNT(*) AS n
    FROM ap_ar_card c
    WHERE c.location_id IS NOT NULL AND c.location_id != ''
      AND NOT EXISTS (SELECT 1 FROM pos_location l WHERE l.location_id = c.location_id)
  `

  const res = await rows<{ n: number | string }>(query)
  return toInt(res[0]?.n)
}

/** TRANSIT_OVERDUE: unsettled non-cash payments older than 7 days or dated in the future. */
export async function checkTransitOverdue(
  segCol: string,
  segIds: Id[] | 'all',
  asOfDate: IsoDate,
): Promise<CheckSummary> {
  if (segIds !== 'all' && segIds.length === 0) {
    return { count: 0, amount: '0.00' }
  }

  const cutoffPast = addDays(asOfDate, -7)
  const cutoffFuture = addDays(asOfDate, 1)

  if (!isSegmentColumn(segCol)) throw new Error(`Invalid segment column: ${segCol}`)
  const segIdent = sql.identifier(segCol)

  const segClause =
    segIds !== 'all'
      ? sql`AND bp.${segIdent} IN (${inList(segIds)})`
      : sql``

  const query = sql`
    SELECT COUNT(*) AS n, COALESCE(SUM(bp.amount), 0) AS amount
    FROM bank_payment bp
    WHERE bp.type IN (${intList(BANK_PAYMENT_CHANNEL_TYPES)})
      AND bp.status = ${BANK_PAYMENT_STATUS.UNSETTLED}
      AND (bp.transaction_date < ${cutoffPast} OR bp.transaction_date >= ${cutoffFuture})
      ${segClause}
  `

  const result = await rows<{ n: number | string; amount: number | string }>(query)
  const n = toInt(result[0]?.n)
  const amount = D(result[0]?.amount || 0).toFixed(2)
  return { count: n, amount }
}

/** Unposted journals of the given periods, in every GL table those periods live in. */
export async function checkUnpostedJournals(periods: Period[]): Promise<number> {
  if (periods.length === 0) return 0

  const counts = await Promise.all(
    Array.from(groupPeriodsByTable(periods).entries()).flatMap(([tableName, tablePeriods]) => {
      const { gl } = glTablesOf(tableName)
      return chunk(tablePeriods.map((p) => p.periodeId)).map((slice) =>
        rows<{ n: number | string }>(sql`
          SELECT COUNT(*) AS n
          FROM ${sql.identifier(gl)} g
          WHERE g.posted_status = 0
            AND g.period_id IN (${inList(slice)})
        `),
      )
    }),
  )
  return counts.reduce((total, result) => total + toInt(result[0]?.n), 0)
}
