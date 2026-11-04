import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { toInt } from '~/server/db/convert'
import { SLICE_CONCURRENCY, chunk, chunkOrAll, mapLimit, sliceCombos } from '~/server/db/chunk'
import { D } from '~/lib/core/money'
import { memo } from '~/server/cache'
import type { Id } from '~/lib/core/types'
import type { CashJournalLineRow } from '~/server/repo/cash/cashflow.repo'
import { DASH_TABLES } from './tables'

const BUILT_TTL_MS = 30_000

/** What the driver returns for a DECIMAL(22,2) column: no leading zeros, always two decimals. */
const TWO_DECIMALS = /^-?(0|[1-9]\d*)\.\d{2}$/

/**
 * Money as two-decimal text. The snapshot columns are DECIMAL(22,2), so the text is almost always in that form already
 * and is kept as it is; building a decimal.js value for every one of the (hundreds of thousands of) rows is the
 * expensive part of reading a long period. Anything else goes through decimal.js, as the live query does.
 */
const toMoney = (value: number | string | null | undefined): string =>
  typeof value === 'string' && TWO_DECIMALS.test(value) ? value : D(value || 0).toFixed(2)

/**
 * Closed periods whose cash lines are in the snapshot, built for exactly this cash account list (`cashHash`):
 * period id → "version" (build time and row count). Empty when the tables do not exist yet.
 */
export function builtCashPeriods(cashHash: string): Promise<Map<Id, string>> {
  return memo(`dash:cash:built:${cashHash}`, BUILT_TTL_MS, async () => {
    try {
      const res = await rows<{ id: string; builtAt: string | null; rowCount: number | string | null }>(sql`
        SELECT CAST(period_id AS CHAR) AS id,
               DATE_FORMAT(built_at, '%Y-%m-%dT%H:%i:%sZ') AS builtAt,
               row_count AS rowCount
        FROM ${sql.identifier(DASH_TABLES.cashPeriods)}
        WHERE cash_hash = ${cashHash}
      `)
      return new Map(res.map((r) => [String(r.id), `${r.builtAt ?? ''}#${r.rowCount ?? 0}`] as const))
    } catch {
      return new Map<Id, string>()
    }
  })
}

type SnapshotLineDbRow = {
  glId: string
  journalType: number | string
  periodId: string
  coaId: string
  segmentDetailId: string | null
  debet: number | string
  credit: number | string
}

/**
 * The lines of the journals that touch a cash account in the given periods, read from the snapshot.
 * Same rows and shape as the live query: a journal counts when one of its lines is a cash line (and, with an entity
 * filter, sits in one of the selected segments); then ALL its lines are returned. The caller passes only periods
 * that are in `builtCashPeriods()`.
 */
export async function snapshotCashLines(periodIds: Id[], segIds: Id[] | 'all'): Promise<CashJournalLineRow[]> {
  if (periodIds.length === 0) return []
  if (segIds !== 'all' && segIds.length === 0) return []
  const table = sql.identifier(DASH_TABLES.cashLines)
  const columns = sql`s.gl_id AS glId, s.journal_type AS journalType, s.period_id AS periodId, s.coa_id AS coaId,
                      s.segment_id AS segmentDetailId, s.debet AS debet, s.credit AS credit`

  const combos = sliceCombos(chunk(periodIds), chunkOrAll(segIds))
  const slices = await mapLimit(combos, SLICE_CONCURRENCY, async ([pChunk, sChunk]) => {
    // Every journal in the snapshot has at least one cash line (that is how a period is built), so with all entities
    // all of its lines are wanted and no journal filter is needed. With an entity filter only the journals that have a
    // cash line in one of the selected segments count; then the semi-join below picks them.
    const query = sChunk
      ? sql`
          SELECT ${columns}
          FROM ${table} s
          JOIN (
            SELECT DISTINCT k0.period_id, k0.gl_id
            FROM ${table} k0
            WHERE k0.period_id IN (${inList(pChunk)})
              AND k0.is_cash = 1
              AND k0.segment_id IN (${inList(sChunk)})
          ) k ON k.period_id = s.period_id AND k.gl_id = s.gl_id
          WHERE s.period_id IN (${inList(pChunk)})
        `
      : sql`
          SELECT ${columns}
          FROM ${table} s
          WHERE s.period_id IN (${inList(pChunk)})
        `
    const res = await rows<SnapshotLineDbRow>(query)
    return res.map((r): CashJournalLineRow => ({
      glId: String(r.glId),
      journalType: toInt(r.journalType),
      periodId: String(r.periodId),
      coaId: String(r.coaId),
      segmentDetailId: r.segmentDetailId ? String(r.segmentDetailId) : null,
      debet: toMoney(r.debet),
      credit: toMoney(r.credit),
    }))
  })
  return slices.flat()
}
