import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { toInt } from '~/server/db/convert'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk } from '~/server/db/chunk'
import { assertSegmentColumn } from '~/server/db/segment-column'
import { glTablesOf, groupPeriodsByTable } from '~/server/db/gl-tables'
import { notCanceledClause, prefetchCanceledDateColumns } from '~/server/db/gl-columns'
import { D } from '~/lib/core/money'
import { mergeJournalPages } from '~/lib/finance/journal/journal-page'
import type { Id, IsoDate, Money, Period } from '~/lib/core/types'

export type JournalLineRow = {
  /** Entity segment detail of the line; '' unless the page was grouped by segment (`bySegment`). */
  segmentDetailId: Id
  glId: Id
  journalNumber: string
  transDate: IsoDate
  journalType: number
  memo: string
  coaId: Id
  debet: Money
  credit: Money
}

export type JournalLinesOptions = {
  periods?: Period[]
  coaIds?: Id[]
  segCol?: string
  segIds?: Id[] | 'all'
  startDate?: IsoDate
  endDate?: IsoDate
  /** Split the lines per entity segment detail (one row per journal × account × segment); needs `segCol`. */
  bySegment?: boolean
  /** GL tables to read when no periods are given (a plain date range); defaults to the active table `gl`. */
  tables?: string[]
  limit?: number
  offset?: number
}

/** True when the options can match nothing (an empty account or segment list), so no query is needed. */
function journalLinesAreEmpty(opts: JournalLinesOptions): boolean {
  if (opts.coaIds && opts.coaIds.length === 0) return true
  return Boolean(opts.segIds && opts.segIds !== 'all' && opts.segIds.length === 0)
}

/** The GL tables to read, each with the periods that live in it (no periods = the given tables, default `gl`). */
function journalTables(opts: JournalLinesOptions): Map<string, Period[]> {
  const periods = opts.periods ?? []
  if (periods.length > 0) return groupPeriodsByTable(periods)
  const tables = opts.tables && opts.tables.length > 0 ? opts.tables : ['gl']
  return new Map(tables.map((t) => [t, []]))
}

/**
 * One page of journal lines, newest first. When the periods span several GL tables, each table
 * returns its first `offset + limit` lines and the pages are merged into one global order.
 */
export async function journalLines(opts: JournalLinesOptions): Promise<JournalLineRow[]> {
  const limit = opts.limit ?? 200
  const offset = opts.offset ?? 0

  if (journalLinesAreEmpty(opts)) return []
  if (opts.segCol) assertSegmentColumn(opts.segCol)

  const grouped = journalTables(opts)
  const multiTable = grouped.size > 1
  const perTableLimit = multiTable ? offset + limit : limit
  const perTableOffset = multiTable ? 0 : offset

  await prefetchCanceledDateColumns(grouped.keys())
  // One page per GL table, all tables in parallel (the pages stay in table order).
  const pages = await Promise.all(
    Array.from(grouped, ([tableName, tablePeriods]) =>
      journalPageOfTable(tableName, tablePeriods, opts, perTableLimit, perTableOffset),
    ),
  )

  return multiTable ? mergeJournalPages(pages, offset, limit) : (pages[0] ?? [])
}

/** Which journals to read: those of the given periods, else those inside the date range, else all. */
function journalPeriodClause(tablePeriods: Period[], opts: JournalLinesOptions) {
  if (tablePeriods.length > 0) return sql`AND g.period_id IN (${inList(tablePeriods.map((p) => p.periodeId))})`
  if (opts.startDate && opts.endDate)
    return sql`AND g.trans_date >= ${opts.startDate} AND g.trans_date <= ${opts.endDate}`
  return sql``
}

/** The first `limit` journal lines (after `offset`) of one GL table, newest first. */
async function journalPageOfTable(
  tableName: string,
  tablePeriods: Period[],
  opts: JournalLinesOptions,
  limit: number,
  offset: number,
): Promise<JournalLineRow[]> {
  const notCanceled = await notCanceledClause(tableName, 'g')
  const { gl, glDetail } = glTablesOf(tableName)
  const glIdent = sql.identifier(gl)
  const glDetailIdent = sql.identifier(glDetail)

  const periodClause = journalPeriodClause(tablePeriods, opts)

  // One more grouping column when the caller wants the entity of every line.
  const segIdent = opts.bySegment && opts.segCol ? sql.identifier(opts.segCol) : null
  const segSelect = segIdent ? sql`, d.${segIdent} AS segmentDetailId` : sql``
  const segGroup = segIdent ? sql`, d.${segIdent}` : sql``

  const coaClause = opts.coaIds && opts.coaIds.length > 0 ? sql`AND d.coa_id IN (${inList(opts.coaIds)})` : sql``

  const segClause =
    opts.segCol && opts.segIds && opts.segIds !== 'all'
      ? sql`AND d.${sql.identifier(opts.segCol)} IN (${inList(opts.segIds)})`
      : sql``

  const query = sql`
    SELECT STRAIGHT_JOIN g.gl_id AS glId,
           g.journal_number AS journalNumber,
           DATE(g.trans_date) AS transDate,
           g.journal_type AS journalType,
           COALESCE(g.memo, '') AS memo,
           d.coa_id AS coaId${segSelect},
           SUM(d.debet) AS debet,
           SUM(d.credit) AS credit
    FROM ${glIdent} g
    JOIN ${glDetailIdent} d ON d.gl_id = g.gl_id
    WHERE g.posted_status = 1
      ${notCanceled}
      ${periodClause}
      ${coaClause}
      ${segClause}
    GROUP BY g.gl_id, g.journal_number, DATE(g.trans_date), g.journal_type, g.memo, d.coa_id${segGroup}
    ORDER BY g.trans_date DESC, g.gl_id DESC, d.coa_id${segGroup}
    LIMIT ${limit} OFFSET ${offset}
  `

  const queryRows = await rows<{
    glId: string | number
    journalNumber: string
    transDate: string
    journalType: number
    memo: string
    coaId: string | number
    segmentDetailId?: string | number | null
    debet: string | number
    credit: string | number
  }>(query)

  return queryRows.map((r) => ({
    glId: String(r.glId),
    journalNumber: r.journalNumber || '',
    segmentDetailId: segIdent ? String(r.segmentDetailId ?? '') : '',
    transDate: String(r.transDate).slice(0, 10),
    journalType: toInt(r.journalType),
    memo: r.memo || '',
    coaId: String(r.coaId),
    debet: D(r.debet || 0).toFixed(2),
    credit: D(r.credit || 0).toFixed(2),
  }))
}

export type JournalHeaderRow = {
  glId: Id
  journalNumber: string
  transDate: IsoDate
  journalType: number
  memo: string
}

/** Journal header fields for a page of gl_ids (drill-down leaves built from cash portions). */
export async function journalHeaders(opts: { tables: string[]; glIds: Id[] }): Promise<JournalHeaderRow[]> {
  if (opts.tables.length === 0 || opts.glIds.length === 0) return []
  const queries = opts.tables.flatMap((tableName) => {
    const { gl } = glTablesOf(tableName)
    return chunk(opts.glIds).map((slice) =>
      rows<{
        glId: string
        journalNumber: string | null
        transDate: string
        journalType: number | string
        memo: string | null
      }>(sql`
        SELECT g.gl_id AS glId, g.journal_number AS journalNumber, DATE(g.trans_date) AS transDate,
               g.journal_type AS journalType, g.memo AS memo
        FROM ${sql.identifier(gl)} g
        WHERE g.gl_id IN (${inList(slice)})
      `),
    )
  })
  const parts = await Promise.all(queries)
  return parts.flat().map((r) => ({
    glId: String(r.glId),
    journalNumber: r.journalNumber ?? '',
    transDate: String(r.transDate).slice(0, 10),
    journalType: toInt(r.journalType),
    memo: r.memo ?? '',
  }))
}
