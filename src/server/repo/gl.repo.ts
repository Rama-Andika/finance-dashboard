import '@tanstack/react-start/server-only'
import { sql, type SQL } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk, chunkOrAll, sliceCombos } from '~/server/db/chunk'
import { assertSegmentColumn } from '~/server/db/segment-column'
import { glTablesOf, groupPeriodsByTable } from '~/server/db/gl-tables'
import { notCanceledClause, prefetchCanceledDateColumns } from '~/server/db/gl-columns'
import { D } from '~/lib/core/money'
import { diffDays } from '~/lib/format/date'
import { mergeJournalPages } from '~/lib/finance/journal/journal-page'
import { glMovementsCache, hashIds, type CachedMovementRow } from '~/server/cache'
import { GL_SNAPSHOT_SEGMENT_COLUMN, builtGlPeriods, snapshotMovements } from '~/server/dash/gl-snapshot'
import type { AccountGroup, Id, IsoDate, Money, Period } from '~/lib/core/types'

export type MovementRow = CachedMovementRow

export type MovementsByPeriodsOptions = {
  periods: Period[]
  segCol: string
  segIds: Id[] | 'all'
  coaIds?: Id[]
  accountGroups?: AccountGroup[]
  byPeriod?: boolean
  byLocation?: boolean
  /** Read closed periods from the dash_snap_gl_monthly snapshot when they are in it (default true; tests turn it off). */
  useSnapshot?: boolean
}

/**
 * Closed periods never change, so their movements are cached per (table, period, filters).
 * Cached rows always carry `periodId`; `byPeriod` only decides whether callers see it, so
 * P&L, trend and drill-down calls share the same cache entries.
 */
function closedPeriodCacheKey(
  tableName: string,
  periodeId: string,
  opts: MovementsByPeriodsOptions,
): string {
  const segHash = hashIds(opts.segIds)
  const coaHash = hashIds(opts.coaIds)
  const groups = (opts.accountGroups || []).slice().sort().join(',')
  return `mv|${tableName}|${periodeId}|Closed|${opts.segCol}|${segHash}|${coaHash}|loc:${Boolean(opts.byLocation)}|g:${groups}`
}

type MovementDbRow = {
  coaId: string
  periodId?: string
  locationId?: string
  debet: string | number
  credit: string | number
}

function toMovementRow(r: MovementDbRow): MovementRow {
  return {
    coaId: String(r.coaId),
    periodId: r.periodId ? String(r.periodId) : undefined,
    locationId: r.locationId ? String(r.locationId) : undefined,
    debet: D(r.debet || 0).toFixed(2),
    credit: D(r.credit || 0).toFixed(2),
  }
}

type SqlIdentifier = ReturnType<typeof sql.identifier>

/** The names and fixed clause one GL table needs in every query slice. */
type GlTableSql = { glIdent: SqlIdentifier; glDetailIdent: SqlIdentifier; segIdent: SqlIdentifier; notCanceled: SQL }

/** One slice (a few periods, accounts and segments) of the movement query; the optional columns and joins follow `opts`. */
function movementQuery(
  tables: GlTableSql,
  opts: MovementsByPeriodsOptions,
  slice: { periodIds: Id[]; coaIds: Id[] | undefined; segIds: Id[] | undefined },
): SQL {
  const { glIdent, glDetailIdent, segIdent, notCanceled } = tables
  const periodColumn = opts.byPeriod ? sql`, g.period_id AS periodId` : sql``
  const locationColumn = opts.byLocation ? sql`, sd.location_id AS locationId` : sql``
  const accountGroupJoin =
    opts.accountGroups && opts.accountGroups.length > 0
      ? sql`JOIN coa c ON c.coa_id = d.coa_id AND c.account_group IN (${inList(opts.accountGroups)})`
      : sql``
  const locationJoin = opts.byLocation ? sql`LEFT JOIN segment_detail sd ON sd.segment_detail_id = d.${segIdent}` : sql``
  const coaFilter = slice.coaIds ? sql`AND d.coa_id IN (${inList(slice.coaIds)})` : sql``
  const segFilter = slice.segIds ? sql`AND d.${segIdent} IN (${inList(slice.segIds)})` : sql``
  const periodGroup = opts.byPeriod ? sql`, g.period_id` : sql``
  const locationGroup = opts.byLocation ? sql`, sd.location_id` : sql``

  // STRAIGHT_JOIN: drive from gl (period index) → gl_detail (gl_id) → coa. Without it the optimizer
  // starts from coa and scans the whole gl_detail history of those accounts (minutes on 13M rows).
  return sql`
      SELECT STRAIGHT_JOIN d.coa_id AS coaId
             ${periodColumn}
             ${locationColumn}
             , SUM(d.debet) AS debet, SUM(d.credit) AS credit
      FROM ${glIdent} g
      JOIN ${glDetailIdent} d ON d.gl_id = g.gl_id
      ${accountGroupJoin}
      ${locationJoin}
      WHERE g.posted_status = 1
        ${notCanceled}
        AND g.period_id IN (${inList(slice.periodIds)})
        ${coaFilter}
        ${segFilter}
      GROUP BY d.coa_id
               ${periodGroup}
               ${locationGroup}
    `
}

async function glTableSql(tableName: string, segCol: string): Promise<GlTableSql> {
  const { gl, glDetail } = glTablesOf(tableName)
  return {
    glIdent: sql.identifier(gl),
    glDetailIdent: sql.identifier(glDetail),
    segIdent: sql.identifier(segCol),
    notCanceled: await notCanceledClause(tableName, 'g'),
  }
}

async function queryMovementsFromDb(
  tableName: string,
  tablePeriods: Period[],
  opts: MovementsByPeriodsOptions,
): Promise<MovementRow[]> {
  if (tablePeriods.length === 0) return []
  if (opts.segIds !== 'all' && opts.segIds.length === 0) return []

  const tables = await glTableSql(tableName, opts.segCol)
  const periodChunks = chunk(tablePeriods.map((p) => p.periodeId))
  const resultRows: MovementRow[] = []

  for (const [periodIds, coaIds, segIds] of sliceCombos(periodChunks, chunkOrAll(opts.coaIds), chunkOrAll(opts.segIds))) {
    const qRows = await rows<MovementDbRow>(movementQuery(tables, opts, { periodIds, coaIds, segIds }))
    for (const r of qRows) resultRows.push(toMovementRow(r))
  }

  return resultRows
}

/**
 * Adds `amounts` to the row stored under `key`, or stores a new row (made by `create`) when there is none.
 * Debit and credit are summed as exact decimals.
 */
function accumulate<T extends { debet: Money; credit: Money }>(
  map: Map<string, T>,
  key: string,
  amounts: { debet: Money; credit: Money },
  create: () => T,
): void {
  const existing = map.get(key)
  if (!existing) {
    map.set(key, create())
    return
  }
  existing.debet = D(existing.debet).plus(D(amounts.debet)).toFixed(2)
  existing.credit = D(existing.credit).plus(D(amounts.credit)).toFixed(2)
}

export async function movementsByPeriods(opts: MovementsByPeriodsOptions): Promise<MovementRow[]> {
  if (opts.periods.length === 0) return []
  if (opts.coaIds && opts.coaIds.length === 0) return []

  assertSegmentColumn(opts.segCol)

  const grouped = groupPeriodsByTable(opts.periods)
  const resultMap = new Map<string, MovementRow>()

  const mergeRows = (rowsToMerge: readonly MovementRow[]) => {
    for (const r of rowsToMerge) {
      const periodId = opts.byPeriod ? r.periodId : undefined
      const key = `${r.coaId}|${periodId ?? ''}|${r.locationId ?? ''}`
      accumulate(resultMap, key, r, () => ({ ...r, periodId }))
    }
  }

  // One query per GL table for all periods that are not cached yet, all tables in parallel.
  await Promise.all(
    Array.from(grouped.entries()).map(async ([tableName, tablePeriods]) => {
      const uncachedClosed: Period[] = []
      // Open or Pre Closed periods are NEVER cached (D20)
      const toQuery: Period[] = []

      for (const p of tablePeriods) {
        if (p.status !== 'Closed') {
          toQuery.push(p)
          continue
        }
        const hit = glMovementsCache.get(closedPeriodCacheKey(tableName, p.periodeId, opts))
        if (hit) mergeRows(hit)
        else uncachedClosed.push(p)
      }

      // Closed periods that are in the snapshot are read from it (small, indexed); the rest from the ERP tables.
      const built = opts.useSnapshot !== false && opts.segCol === GL_SNAPSHOT_SEGMENT_COLUMN ? await builtGlPeriods() : new Set<string>()
      const fromSnapshot = uncachedClosed.filter((p) => built.has(p.periodeId))
      const fromErp = uncachedClosed.filter((p) => !built.has(p.periodeId))

      const [snapshotRows, erpRows, openRows] = await Promise.all([
        fromSnapshot.length > 0 ? snapshotMovements(fromSnapshot.map((p) => p.periodeId), opts) : Promise.resolve([]),
        queryMovementsFromDb(tableName, fromErp, { ...opts, byPeriod: true }),
        queryMovementsFromDb(tableName, toQuery, opts),
      ])
      const closedRows = snapshotRows.concat(erpRows)

      const byPeriod = new Map<string, MovementRow[]>(uncachedClosed.map((p) => [p.periodeId, []]))
      for (const r of closedRows) byPeriod.get(r.periodId ?? '')?.push(r)
      for (const [periodeId, periodRows] of byPeriod) {
        glMovementsCache.set(closedPeriodCacheKey(tableName, periodeId, opts), periodRows)
        mergeRows(periodRows)
      }
      mergeRows(openRows)
    }),
  )

  return Array.from(resultMap.values())
}

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

  const result: DateMovementRow[] = []
  for (const [coaIds, segIds] of sliceCombos(chunkOrAll(opts.coaIds), chunkOrAll(opts.segIds))) {
    const queryRows = await rows<DateMovementDbRow>(dateMovementQuery(tables, opts, driveFromGl, { coaIds, segIds }))
    for (const r of queryRows) result.push(toDateMovementRow(r, Boolean(opts.bySegment)))
  }
  return result
}

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
  const opening = D(resultMap.get(key)?.opening ?? 0).plus(D(r.opening || 0)).toFixed(2)
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

  for (const [coaIds, segIds] of sliceCombos(chunk(opts.coaIds), chunkOrAll(opts.segIds))) {
    const queryRows = await rows<OpeningDbRow>(openingQuery(opts, { coaIds, segIds }))
    for (const r of queryRows) addOpening(resultMap, r, Boolean(opts.bySegment))
  }

  return Array.from(resultMap.values())
}

export async function countOpeningRows(periodeId: Id): Promise<number> {
  const result = await rows<{ n: number | string }>(sql`
    SELECT COUNT(*) AS n
    FROM coa_opening_balance_location
    WHERE periode_id = ${periodeId}
  `)
  return Number(result[0]?.n ?? 0)
}

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
  if (opts.startDate && opts.endDate) return sql`AND g.trans_date >= ${opts.startDate} AND g.trans_date <= ${opts.endDate}`
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

  const coaClause =
    opts.coaIds && opts.coaIds.length > 0 ? sql`AND d.coa_id IN (${inList(opts.coaIds)})` : sql``

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
    journalType: Number(r.journalType) || 0,
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
    journalType: Number(r.journalType) || 0,
    memo: r.memo ?? '',
  }))
}
