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

  const combos = sliceCombos(chunk(periodIds), chunkOrAll(segIds))
  const slices = await mapLimit(combos, SLICE_CONCURRENCY, async ([pChunk, sChunk]) => {
    const res = await rows<SnapshotLineDbRow>(sql`
      SELECT s.gl_id AS glId,
             s.journal_type AS journalType,
             s.period_id AS periodId,
             s.coa_id AS coaId,
             s.segment_id AS segmentDetailId,
             s.debet AS debet,
             s.credit AS credit
      FROM ${table} s
      JOIN (
        SELECT DISTINCT k0.period_id, k0.gl_id
        FROM ${table} k0
        WHERE k0.period_id IN (${inList(pChunk)})
          AND k0.is_cash = 1
          ${sChunk ? sql`AND k0.segment_id IN (${inList(sChunk)})` : sql``}
      ) k ON k.period_id = s.period_id AND k.gl_id = s.gl_id
      WHERE s.period_id IN (${inList(pChunk)})
    `)
    return res.map((r): CashJournalLineRow => ({
      glId: String(r.glId),
      journalType: toInt(r.journalType),
      periodId: String(r.periodId),
      coaId: String(r.coaId),
      segmentDetailId: r.segmentDetailId ? String(r.segmentDetailId) : null,
      debet: D(r.debet || 0).toFixed(2),
      credit: D(r.credit || 0).toFixed(2),
    }))
  })
  return slices.flat()
}
