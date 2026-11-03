import '@tanstack/react-start/server-only'
import { sql, type SQL } from 'drizzle-orm'
import { toInt } from '~/server/db/convert'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { SLICE_CONCURRENCY, chunk, chunkOrAll, mapLimit, sliceCombos } from '~/server/db/chunk'
import { D } from '~/lib/core/money'
import type { Id, Money } from '~/lib/core/types'

export type OpeningBalanceRow = {
  coaId: Id
  segmentDetailId?: Id
  opening: Money
}

type OpeningBalancesOptions = {
  periodeId: Id
  segCol: string
  segIds: Id[] | 'all'
  coaIds: Id[]
  /** Group by segment1_id (one row per coa × segment detail). */
  bySegment?: boolean
}

type OpeningDbRow = { coaId: string; segmentDetailId?: string | null; opening: string | number }

/** One slice (a few accounts and segments) of the opening-balance query. */
function openingQuery(opts: OpeningBalancesOptions, slice: { coaIds: Id[]; segIds: Id[] | undefined }): SQL {
  const segmentColumn = opts.bySegment ? sql`, o.segment1_id AS segmentDetailId` : sql``
  const segFilter = slice.segIds ? sql`AND o.segment1_id IN (${inList(slice.segIds)})` : sql``
  const segmentGroup = opts.bySegment ? sql`, o.segment1_id` : sql``
  return sql`
      SELECT o.coa_id AS coaId
             ${segmentColumn}
             , SUM(o.opening_balance) AS opening
      FROM coa_opening_balance_location o
      WHERE o.periode_id = ${opts.periodeId}
        AND o.coa_id IN (${inList(slice.coaIds)})
        ${segFilter}
      GROUP BY o.coa_id ${segmentGroup}
    `
}

/** Adds one database row to the running opening balance of its (account, segment) pair. */
function addOpening(resultMap: Map<string, OpeningBalanceRow>, r: OpeningDbRow, bySegment: boolean): void {
  const coaId = String(r.coaId)
  const segmentDetailId = bySegment ? String(r.segmentDetailId ?? '') : undefined
  const key = `${coaId}|${segmentDetailId ?? ''}`
  const opening = D(resultMap.get(key)?.opening ?? 0)
    .plus(D(r.opening || 0))
    .toFixed(2)
  resultMap.set(key, { coaId, segmentDetailId, opening })
}

export async function openingBalances(opts: OpeningBalancesOptions): Promise<OpeningBalanceRow[]> {
  if (opts.coaIds.length === 0) return []
  if (opts.segIds !== 'all' && opts.segIds.length === 0) return []

  // Ensure entity segment is segment1_id (Step 9.1 rule)
  if (opts.segCol !== 'segment1_id') {
    throw new Error('Entity segment is not segment1_id — user decision required')
  }

  const resultMap = new Map<string, OpeningBalanceRow>()

  const combos = sliceCombos(chunk(opts.coaIds), chunkOrAll(opts.segIds))
  const slices = await mapLimit(combos, SLICE_CONCURRENCY, async ([coaIds, segIds]) =>
    rows<OpeningDbRow>(openingQuery(opts, { coaIds, segIds })),
  )
  for (const queryRows of slices) for (const r of queryRows) addOpening(resultMap, r, Boolean(opts.bySegment))

  return Array.from(resultMap.values())
}

export async function countOpeningRows(periodeId: Id): Promise<number> {
  const result = await rows<{ n: number | string }>(sql`
    SELECT COUNT(*) AS n
    FROM coa_opening_balance_location
    WHERE periode_id = ${periodeId}
  `)
  return toInt(result[0]?.n)
}
