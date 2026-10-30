import '@tanstack/react-start/server-only'
import { sql, type SQL } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk, chunkOrAll } from '~/server/db/chunk'
import { assertSegmentColumn } from '~/server/db/segment-column'
import { BANK_PAYMENT_CHANNEL_TYPES, BANK_PAYMENT_GIRO_TYPES, BANK_PAYMENT_STATUS, intList } from '~/server/db/erp-codes'
import { addDays } from '~/lib/format/date'
import { D } from '~/lib/core/money'
import { hashIds, memo } from '~/server/cache'
import type { Id, IsoDate, Money } from '~/lib/core/types'

const UNSETTLED_CACHE_MS = 60 * 1000

/**
 * Register rows that are still "not settled" at the end of the as-of day: open now, or settled only after that day.
 * `asOfPlusOne` is the day after the as-of date. Without the second branch, a past date would lose every row
 * that has been settled since then. A settled row without a payment date is not counted.
 * Used by the totals and by the drill-down list, so both always add up.
 */
export function unsettledAtClause(asOfPlusOne: IsoDate): SQL {
  return sql`AND (bp.status = ${BANK_PAYMENT_STATUS.UNSETTLED} OR (bp.status = ${BANK_PAYMENT_STATUS.SETTLED} AND bp.payment_date >= ${asOfPlusOne}))`
}

export type UnsettledChannelRow = {
  coaId: Id
  segmentDetailId: Id
  txDate: IsoDate
  n: number
  amount: Money
}

export type SettlementLagRow = {
  coaId: Id
  avgLag: number
  n: number
}

/**
 * unsettledByChannel(asOf, coaIds, segIds, segCol)
 * Funds not yet settled in bank_payment (data-model §6.2, D30)
 */
export function unsettledByChannel(
  asOf: IsoDate,
  coaIds: Id[],
  segIds: Id[] | 'all',
  segCol: string = 'segment1_id',
): Promise<UnsettledChannelRow[]> {
  if (coaIds.length === 0) return Promise.resolve([])
  if (segIds !== 'all' && segIds.length === 0) return Promise.resolve([])

  assertSegmentColumn(segCol)
  // Cash Position, Payment Plan and Data Checks ask for the same register within one minute.
  const key = `unsettled|${asOf}|${segCol}|${hashIds(segIds)}|${hashIds(coaIds)}`
  return memo(key, UNSETTLED_CACHE_MS, () => queryUnsettledByChannel(asOf, coaIds, segIds, segCol))
}

async function queryUnsettledByChannel(
  asOf: IsoDate,
  coaIds: Id[],
  segIds: Id[] | 'all',
  segCol: string,
): Promise<UnsettledChannelRow[]> {
  const asOfPlusOne = addDays(asOf, 1)
  const segIdent = sql.identifier(segCol)

  const result: UnsettledChannelRow[] = []

  for (const cChunk of chunk(coaIds)) {
    for (const sChunk of chunkOrAll(segIds)) {
      const query = sql`
        SELECT bp.coa_id AS coaId,
               bp.${segIdent} AS segmentDetailId,
               DATE(bp.transaction_date) AS txDate,
               COUNT(*) AS n,
               COALESCE(SUM(bp.amount), 0) AS amount
        FROM bank_payment bp
        WHERE bp.type IN (${intList(BANK_PAYMENT_CHANNEL_TYPES)})
          ${unsettledAtClause(asOfPlusOne)}
          AND bp.coa_id IN (${inList(cChunk)})
          AND bp.transaction_date < ${asOfPlusOne}
          ${sChunk ? sql`AND bp.${segIdent} IN (${inList(sChunk)})` : sql``}
        GROUP BY bp.coa_id, bp.${segIdent}, DATE(bp.transaction_date)
      `

      const res = await rows<{
        coaId: string
        segmentDetailId: string | null
        txDate: string
        n: number | string
        amount: number | string
      }>(query)

      for (const r of res) {
        result.push({
          coaId: String(r.coaId),
          segmentDetailId: r.segmentDetailId ? String(r.segmentDetailId) : '',
          txDate: String(r.txDate).slice(0, 10),
          n: Number(r.n) || 0,
          amount: D(r.amount || 0).toFixed(2),
        })
      }
    }
  }

  return result
}

/**
 * settlementLag(today, coaIds)
 * Average settlement lag in days over the last 90 days (data-model §6.9)
 */
export async function settlementLag(
  today: IsoDate,
  coaIds: Id[],
): Promise<SettlementLagRow[]> {
  if (coaIds.length === 0) return []

  const todayMinus90 = addDays(today, -90)
  const todayPlusOne = addDays(today, 1)

  const result: SettlementLagRow[] = []

  for (const cChunk of chunk(coaIds)) {
    const query = sql`
      SELECT bp.coa_id AS coaId,
             AVG(DATEDIFF(bp.payment_date, DATE(bp.transaction_date))) AS avgLag,
             COUNT(*) AS n
      FROM bank_payment bp
      WHERE bp.type IN (${intList(BANK_PAYMENT_CHANNEL_TYPES)})
        AND bp.status = ${BANK_PAYMENT_STATUS.SETTLED}
        AND bp.payment_date IS NOT NULL
        AND bp.transaction_date >= ${todayMinus90}
        AND bp.transaction_date < ${todayPlusOne}
        AND bp.coa_id IN (${inList(cChunk)})
      GROUP BY bp.coa_id
    `

    const res = await rows<{
      coaId: string
      avgLag: number | string | null
      n: number | string
    }>(query)

    for (const r of res) {
      result.push({
        coaId: String(r.coaId),
        avgLag: r.avgLag !== null ? Number(r.avgLag) : 1,
        n: Number(r.n) || 0,
      })
    }
  }

  return result
}

/**
 * Giro, pending cheque and e-banking payments to vendors (bank_payment types 0, 4, 7) that the bank has not cleared
 * at the end of `asOf`. The payable is already reduced when the payment is recorded, but the bank balance only drops
 * when the payment clears, so this amount is shown next to the cash position (it is NOT part of it).
 */
export function outstandingGiro(
  asOf: IsoDate,
  segIds: Id[] | 'all',
  segCol: string = 'segment1_id',
): Promise<Money> {
  if (segIds !== 'all' && segIds.length === 0) return Promise.resolve('0.00')

  assertSegmentColumn(segCol)
  const key = `giro|${asOf}|${segCol}|${hashIds(segIds)}`
  return memo(key, UNSETTLED_CACHE_MS, () => queryOutstandingGiro(asOf, segIds, segCol))
}

async function queryOutstandingGiro(asOf: IsoDate, segIds: Id[] | 'all', segCol: string): Promise<Money> {
  const asOfPlusOne = addDays(asOf, 1)
  const segIdent = sql.identifier(segCol)
  let total = D(0)

  for (const sChunk of chunkOrAll(segIds)) {
    const res = await rows<{ amount: number | string | null }>(sql`
      SELECT COALESCE(SUM(bp.amount), 0) AS amount
      FROM bank_payment bp
      WHERE bp.type IN (${intList(BANK_PAYMENT_GIRO_TYPES)})
        AND bp.transaction_date < ${asOfPlusOne}
        ${unsettledAtClause(asOfPlusOne)}
        ${sChunk ? sql`AND bp.${segIdent} IN (${inList(sChunk)})` : sql``}
    `)
    total = total.plus(D(res[0]?.amount ?? 0))
  }

  return total.toFixed(2)
}

export type UnsettledTransactionRow = {
  id: Id
  number: string
  txDate: IsoDate
  amount: Money
}

/** Unsettled register rows of one channel (drill-down leaf, D30). */
export async function unsettledTransactions(opts: {
  coaId: Id
  asOf: IsoDate
  segCol: string
  segIds: Id[] | 'all'
  txDate?: IsoDate
  limit: number
  offset: number
}): Promise<UnsettledTransactionRow[]> {
  if (opts.segIds !== 'all' && opts.segIds.length === 0) return []
  assertSegmentColumn(opts.segCol)
  const segIdent = sql.identifier(opts.segCol)
  const asOfPlusOne = addDays(opts.asOf, 1)
  const segIds = opts.segIds === 'all' ? null : opts.segIds

  const res = await rows<{ id: string; number: string | null; txDate: string; amount: string | number }>(sql`
    SELECT bp.bank_payment_id AS id,
           COALESCE(bp.number, '') AS number,
           DATE(bp.transaction_date) AS txDate,
           bp.amount AS amount
    FROM bank_payment bp
    WHERE bp.type IN (${intList(BANK_PAYMENT_CHANNEL_TYPES)})
      ${unsettledAtClause(asOfPlusOne)}
      AND bp.coa_id = ${opts.coaId}
      AND bp.transaction_date < ${asOfPlusOne}
      ${opts.txDate ? sql`AND bp.transaction_date >= ${opts.txDate} AND bp.transaction_date < ${addDays(opts.txDate, 1)}` : sql``}
      ${segIds ? sql`AND bp.${segIdent} IN (${inList(segIds)})` : sql``}
    ORDER BY bp.transaction_date, bp.bank_payment_id
    LIMIT ${opts.limit} OFFSET ${opts.offset}
  `)

  return res.map((r) => ({
    id: String(r.id),
    number: r.number ?? '',
    txDate: String(r.txDate).slice(0, 10),
    amount: D(r.amount || 0).toFixed(2),
  }))
}
