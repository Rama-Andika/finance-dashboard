import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { SLICE_CONCURRENCY, chunk, chunkOrAll, mapLimit, sliceCombos } from '~/server/db/chunk'
import { D } from '~/lib/core/money'
import { readSnapshotIndex } from './built-index'
import type { Id, Money } from '~/lib/core/types'
import { DASH_TABLES } from './tables'

const BUILT_TTL_MS = 30_000

/**
 * Closed periods whose balance totals are in the snapshot and usable (built from saved opening balances, so with at least
 * one row): period id → "version" (build time and row count). Empty when the tables do not exist yet. Any other read
 * error is logged and also answers empty (not remembered, and not tried again for a few seconds).
 */
export function builtBalancePeriods(): Promise<Map<Id, string>> {
  return readSnapshotIndex('dash:balance:built', BUILT_TTL_MS, 'balance snapshot index', async () => {
    const res = await rows<{ id: string; builtAt: string | null; rowCount: number | string | null }>(sql`
      SELECT CAST(period_id AS CHAR) AS id,
             DATE_FORMAT(built_at, '%Y-%m-%dT%H:%i:%sZ') AS builtAt,
             row_count AS rowCount
      FROM ${sql.identifier(DASH_TABLES.balancePeriods)}
      WHERE row_count > 0
    `)
    return new Map(res.map((r) => [String(r.id), `${r.builtAt ?? ''}#${r.rowCount ?? 0}`] as const))
  })
}

/** The total of every group (the six balance sheet groups and 'Profit') of one period. */
export type BalanceGroupAmounts = Record<string, Money>

/**
 * The balance totals of closed periods from the snapshot, per period, added up over the selected entity segments
 * (`'all'` = every segment, including the rows without a segment). The caller passes only periods that are in
 * `builtBalancePeriods()`; a period without rows is not in the answer.
 */
export async function snapshotBalanceTotals(
  periodIds: readonly Id[],
  segIds: Id[] | 'all',
): Promise<Map<Id, BalanceGroupAmounts>> {
  const result = new Map<Id, BalanceGroupAmounts>()
  if (periodIds.length === 0) return result
  if (segIds !== 'all' && segIds.length === 0) return result
  const table = sql.identifier(DASH_TABLES.balanceMonthly)

  const combos = sliceCombos(chunk([...periodIds]), chunkOrAll(segIds))
  const slices = await mapLimit(combos, SLICE_CONCURRENCY, ([pChunk, sChunk]) =>
    rows<{ periodId: string; groupKey: string; amount: string | number }>(sql`
      SELECT s.period_id AS periodId, s.group_key AS groupKey, SUM(s.amount) AS amount
      FROM ${table} s
      WHERE s.period_id IN (${inList(pChunk)})
        ${sChunk ? sql`AND s.segment_id IN (${inList(sChunk)})` : sql``}
      GROUP BY s.period_id, s.group_key
    `),
  )

  for (const r of slices.flat()) {
    const periodId = String(r.periodId)
    const amounts = result.get(periodId) ?? {}
    amounts[r.groupKey] = D(amounts[r.groupKey]).plus(D(r.amount)).toFixed(2)
    result.set(periodId, amounts)
  }
  return result
}
