import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { addDays } from '~/lib/format/date'
import type { Id, IsoDate, Money } from '~/lib/finance/types'

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
export async function unsettledByChannel(
  asOf: IsoDate,
  coaIds: Id[],
  segIds: Id[] | 'all',
  segCol: string = 'segment1_id',
): Promise<UnsettledChannelRow[]> {
  if (coaIds.length === 0) return []
  if (segIds !== 'all' && segIds.length === 0) return []

  if (!/^segment([1-9]|1[0-5])_id$/.test(segCol)) {
    throw new Error(`Invalid segment column: ${segCol}`)
  }

  const asOfPlusOne = addDays(asOf, 1)
  const segIdent = sql.identifier(segCol)

  const coaChunks: string[][] = []
  for (let i = 0; i < coaIds.length; i += 1000) {
    coaChunks.push(coaIds.slice(i, i + 1000))
  }

  const segChunks: (string[] | undefined)[] = []
  if (segIds !== 'all') {
    for (let i = 0; i < segIds.length; i += 1000) {
      segChunks.push(segIds.slice(i, i + 1000))
    }
  } else {
    segChunks.push(undefined)
  }

  const result: UnsettledChannelRow[] = []

  for (const cChunk of coaChunks) {
    for (const sChunk of segChunks) {
      const query = sql`
        SELECT bp.coa_id AS coaId,
               bp.${segIdent} AS segmentDetailId,
               DATE(bp.transaction_date) AS txDate,
               COUNT(*) AS n,
               COALESCE(SUM(bp.amount), 0) AS amount
        FROM bank_payment bp
        WHERE bp.type IN (1, 2)
          AND bp.status = 0
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
          amount: Number(r.amount || 0).toFixed(2),
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

  const coaChunks: string[][] = []
  for (let i = 0; i < coaIds.length; i += 1000) {
    coaChunks.push(coaIds.slice(i, i + 1000))
  }

  const result: SettlementLagRow[] = []

  for (const cChunk of coaChunks) {
    const query = sql`
      SELECT bp.coa_id AS coaId,
             AVG(DATEDIFF(bp.payment_date, DATE(bp.transaction_date))) AS avgLag,
             COUNT(*) AS n
      FROM bank_payment bp
      WHERE bp.type IN (1, 2)
        AND bp.status = 1
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
