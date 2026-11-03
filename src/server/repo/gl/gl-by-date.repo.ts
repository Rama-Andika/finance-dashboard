import '@tanstack/react-start/server-only'
import { sql, type SQL } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { SLICE_CONCURRENCY, chunkOrAll, mapLimit, sliceCombos } from '~/server/db/chunk'
import { assertSegmentColumn } from '~/server/db/segment-column'
import { prefetchCanceledDateColumns } from '~/server/db/gl-columns'
import { D } from '~/lib/core/money'
import { diffDays } from '~/lib/format/date'
import { accumulate, glTableSql, type GlTableSql } from '~/server/repo/gl/shared'
import type { Id, IsoDate, Money } from '~/lib/core/types'

export type MovementsByDateOptions = {
  from: IsoDate
  to: IsoDate
  tables: string[]
  segCol: string
  segIds: Id[] | 'all'
  coaIds?: Id[]
  byDate?: boolean
  /** Group by the entity segment column (one row per coa × segment detail). */
  bySegment?: boolean
}

export type DateMovementRow = {
  coaId: Id
  transDate?: IsoDate
  segmentDetailId?: Id
  debet: Money
  credit: Money
}

/**
 * Date ranges up to this many days are driven from gl's trans_date index (STRAIGHT_JOIN); longer ones
 * (trial-balance fallback over the whole history) are better served by the coa_id index.
 */
const MAX_TRANS_DATE_INDEX_RANGE_DAYS = 400

export async function movementsByDate(opts: MovementsByDateOptions): Promise<DateMovementRow[]> {
  if (opts.tables.length === 0) return []
  if (opts.coaIds && opts.coaIds.length === 0) return []
  if (opts.segIds !== 'all' && opts.segIds.length === 0) return []

  assertSegmentColumn(opts.segCol)

  // Short ranges: drive from gl's trans_date index (see movementsByPeriods). Long ranges (trial-balance
  // fallback over the whole history) are better served by the coa_id index, so the optimizer decides.
  const driveFromGl = diffDays(opts.to, opts.from) <= MAX_TRANS_DATE_INDEX_RANGE_DAYS

  await prefetchCanceledDateColumns(opts.tables)
  // One read per GL table, all tables in parallel; merged in table order so the result order is stable.
  const perTable = await Promise.all(opts.tables.map((tableName) => dateMovementsOfTable(tableName, opts, driveFromGl)))

  const resultMap = new Map<string, DateMovementRow>()
  for (const row of perTable.flat()) {
    accumulate(resultMap, `${row.coaId}|${row.transDate ?? ''}|${row.segmentDetailId ?? ''}`, row, () => ({ ...row }))
  }
  return Array.from(resultMap.values())
}

type DateMovementDbRow = {
  coaId: string
  transDate?: string
  segmentDetailId?: string | null
  debet: string | number
  credit: string | number
}

function toDateMovementRow(r: DateMovementDbRow, bySegment: boolean): DateMovementRow {
  return {
    coaId: String(r.coaId),
    transDate: r.transDate ? String(r.transDate).slice(0, 10) : undefined,
    segmentDetailId: bySegment ? String(r.segmentDetailId ?? '') : undefined,
    debet: D(r.debet || 0).toFixed(2),
    credit: D(r.credit || 0).toFixed(2),
  }
}

/** One slice (a few accounts and segments) of the date-range movement query. */
function dateMovementQuery(
  tables: GlTableSql,
  opts: MovementsByDateOptions,
  driveFromGl: boolean,
  slice: { coaIds: Id[] | undefined; segIds: Id[] | undefined },
): SQL {
  const { glIdent, glDetailIdent, segIdent, notCanceled } = tables
  const straightJoin = driveFromGl ? sql`STRAIGHT_JOIN ` : sql``
  const dateColumn = opts.byDate ? sql`, DATE(g.trans_date) AS transDate` : sql``
  const segmentColumn = opts.bySegment ? sql`, d.${segIdent} AS segmentDetailId` : sql``
  const coaFilter = slice.coaIds ? sql`AND d.coa_id IN (${inList(slice.coaIds)})` : sql``
  const segFilter = slice.segIds ? sql`AND d.${segIdent} IN (${inList(slice.segIds)})` : sql``
  const dateGroup = opts.byDate ? sql`, DATE(g.trans_date)` : sql``
  const segmentGroup = opts.bySegment ? sql`, d.${segIdent}` : sql``

  return sql`
      SELECT ${straightJoin}d.coa_id AS coaId
             ${dateColumn}
             ${segmentColumn}
             , SUM(d.debet) AS debet, SUM(d.credit) AS credit
      FROM ${glIdent} g
      JOIN ${glDetailIdent} d ON d.gl_id = g.gl_id
      WHERE g.posted_status = 1
        ${notCanceled}
        AND g.trans_date >= ${opts.from}
        AND g.trans_date <= ${opts.to}
        ${coaFilter}
        ${segFilter}
      GROUP BY d.coa_id
               ${dateGroup}
               ${segmentGroup}
    `
}

/** The movements of one GL table (one query per slice when the account or segment list is above the IN limit). */
async function dateMovementsOfTable(
  tableName: string,
  opts: MovementsByDateOptions,
  driveFromGl: boolean,
): Promise<DateMovementRow[]> {
  const tables = await glTableSql(tableName, opts.segCol)

  const combos = sliceCombos(chunkOrAll(opts.coaIds), chunkOrAll(opts.segIds))
  const slices = await mapLimit(combos, SLICE_CONCURRENCY, async ([coaIds, segIds]) => {
    const queryRows = await rows<DateMovementDbRow>(dateMovementQuery(tables, opts, driveFromGl, { coaIds, segIds }))
    return queryRows.map((r) => toDateMovementRow(r, Boolean(opts.bySegment)))
  })
  return slices.flat()
}
