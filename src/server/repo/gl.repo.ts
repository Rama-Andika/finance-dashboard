import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk, chunkOrAll } from '~/server/db/chunk'
import { assertSegmentColumn } from '~/server/db/segment-column'
import { glTablesOf, groupPeriodsByTable } from '~/server/db/gl-tables'
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

async function queryMovementsFromDb(
  tableName: string,
  tablePeriods: Period[],
  opts: MovementsByPeriodsOptions,
): Promise<MovementRow[]> {
  if (tablePeriods.length === 0) return []
  if (opts.segIds !== 'all' && opts.segIds.length === 0) return []

  const { gl, glDetail } = glTablesOf(tableName)
  const glIdent = sql.identifier(gl)
  const glDetailIdent = sql.identifier(glDetail)
  const segIdent = sql.identifier(opts.segCol)

  const periodChunks = chunk(tablePeriods.map((p) => p.periodeId))
  const resultRows: MovementRow[] = []

  for (const pChunk of periodChunks) {
    for (const cChunk of chunkOrAll(opts.coaIds)) {
      for (const sChunk of chunkOrAll(opts.segIds)) {
        // STRAIGHT_JOIN: drive from gl (period index) → gl_detail (gl_id) → coa. Without it the optimizer
        // starts from coa and scans the whole gl_detail history of those accounts (minutes on 13M rows).
        const query = sql`
          SELECT STRAIGHT_JOIN d.coa_id AS coaId
                 ${opts.byPeriod ? sql`, g.period_id AS periodId` : sql``}
                 ${opts.byLocation ? sql`, sd.location_id AS locationId` : sql``}
                 , SUM(d.debet) AS debet, SUM(d.credit) AS credit
          FROM ${glIdent} g
          JOIN ${glDetailIdent} d ON d.gl_id = g.gl_id
          ${
            opts.accountGroups && opts.accountGroups.length > 0
              ? sql`JOIN coa c ON c.coa_id = d.coa_id AND c.account_group IN (${inList(opts.accountGroups)})`
              : sql``
          }
          ${
            opts.byLocation
              ? sql`LEFT JOIN segment_detail sd ON sd.segment_detail_id = d.${segIdent}`
              : sql``
          }
          WHERE g.posted_status = 1
            AND g.canceled_date IS NULL
            AND g.period_id IN (${inList(pChunk)})
            ${cChunk ? sql`AND d.coa_id IN (${inList(cChunk)})` : sql``}
            ${sChunk ? sql`AND d.${segIdent} IN (${inList(sChunk)})` : sql``}
          GROUP BY d.coa_id
                   ${opts.byPeriod ? sql`, g.period_id` : sql``}
                   ${opts.byLocation ? sql`, sd.location_id` : sql``}
        `

        const qRows = await rows<{
          coaId: string
          periodId?: string
          locationId?: string
          debet: string | number
          credit: string | number
        }>(query)

        for (const r of qRows) {
          resultRows.push({
            coaId: String(r.coaId),
            periodId: r.periodId ? String(r.periodId) : undefined,
            locationId: r.locationId ? String(r.locationId) : undefined,
            debet: D(r.debet || 0).toFixed(2),
            credit: D(r.credit || 0).toFixed(2),
          })
        }
      }
    }
  }

  return resultRows
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
      const existing = resultMap.get(key)
      if (existing) {
        existing.debet = D(existing.debet).plus(D(r.debet)).toFixed(2)
        existing.credit = D(existing.credit).plus(D(r.credit)).toFixed(2)
      } else {
        resultMap.set(key, { ...r, periodId })
      }
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

export async function movementsByDate(opts: MovementsByDateOptions): Promise<DateMovementRow[]> {
  if (opts.tables.length === 0) return []
  if (opts.coaIds && opts.coaIds.length === 0) return []
  if (opts.segIds !== 'all' && opts.segIds.length === 0) return []

  assertSegmentColumn(opts.segCol)
  const segIdent = sql.identifier(opts.segCol)

  // Short ranges: drive from gl's trans_date index (see movementsByPeriods). Long ranges (trial-balance
  // fallback over the whole history) are better served by the coa_id index, so the optimizer decides.
  const driveFromGl = diffDays(opts.to, opts.from) <= 400

  const resultMap = new Map<string, DateMovementRow>()

  for (const tableName of opts.tables) {
    const { gl, glDetail } = glTablesOf(tableName)
    const glIdent = sql.identifier(gl)
    const glDetailIdent = sql.identifier(glDetail)

    for (const cChunk of chunkOrAll(opts.coaIds)) {
      for (const sChunk of chunkOrAll(opts.segIds)) {
        const query = sql`
          SELECT ${driveFromGl ? sql`STRAIGHT_JOIN ` : sql``}d.coa_id AS coaId
                 ${opts.byDate ? sql`, DATE(g.trans_date) AS transDate` : sql``}
                 ${opts.bySegment ? sql`, d.${segIdent} AS segmentDetailId` : sql``}
                 , SUM(d.debet) AS debet, SUM(d.credit) AS credit
          FROM ${glIdent} g
          JOIN ${glDetailIdent} d ON d.gl_id = g.gl_id
          WHERE g.posted_status = 1
            AND g.canceled_date IS NULL
            AND g.trans_date >= ${opts.from}
            AND g.trans_date <= ${opts.to}
            ${cChunk ? sql`AND d.coa_id IN (${inList(cChunk)})` : sql``}
            ${sChunk ? sql`AND d.${segIdent} IN (${inList(sChunk)})` : sql``}
          GROUP BY d.coa_id
                   ${opts.byDate ? sql`, DATE(g.trans_date)` : sql``}
                   ${opts.bySegment ? sql`, d.${segIdent}` : sql``}
        `

        const queryRows = await rows<{
          coaId: string
          transDate?: string
          segmentDetailId?: string | null
          debet: string | number
          credit: string | number
        }>(query)

        for (const r of queryRows) {
          const coaId = String(r.coaId)
          const transDate = r.transDate ? String(r.transDate).slice(0, 10) : undefined
          const segmentDetailId = opts.bySegment ? String(r.segmentDetailId ?? '') : undefined
          const key = `${coaId}|${transDate ?? ''}|${segmentDetailId ?? ''}`

          const existing = resultMap.get(key)
          if (existing) {
            existing.debet = D(existing.debet).plus(D(r.debet || 0)).toFixed(2)
            existing.credit = D(existing.credit).plus(D(r.credit || 0)).toFixed(2)
          } else {
            resultMap.set(key, {
              coaId,
              transDate,
              segmentDetailId,
              debet: D(r.debet || 0).toFixed(2),
              credit: D(r.credit || 0).toFixed(2),
            })
          }
        }
      }
    }
  }

  return Array.from(resultMap.values())
}

export type OpeningBalanceRow = {
  coaId: Id
  segmentDetailId?: Id
  opening: Money
}

export async function openingBalances(opts: {
  periodeId: Id
  segCol: string
  segIds: Id[] | 'all'
  coaIds: Id[]
  /** Group by segment1_id (one row per coa × segment detail). */
  bySegment?: boolean
}): Promise<OpeningBalanceRow[]> {
  if (opts.coaIds.length === 0) return []
  if (opts.segIds !== 'all' && opts.segIds.length === 0) return []

  // Ensure entity segment is segment1_id (Step 9.1 rule)
  if (opts.segCol !== 'segment1_id') {
    throw new Error('Entity segment is not segment1_id — user decision required')
  }

  const resultMap = new Map<string, OpeningBalanceRow>()

  for (const cChunk of chunk(opts.coaIds)) {
    for (const sChunk of chunkOrAll(opts.segIds)) {
      const query = sql`
        SELECT o.coa_id AS coaId
               ${opts.bySegment ? sql`, o.segment1_id AS segmentDetailId` : sql``}
               , SUM(o.opening_balance) AS opening
        FROM coa_opening_balance_location o
        WHERE o.periode_id = ${opts.periodeId}
          AND o.coa_id IN (${inList(cChunk)})
          ${sChunk ? sql`AND o.segment1_id IN (${inList(sChunk)})` : sql``}
        GROUP BY o.coa_id ${opts.bySegment ? sql`, o.segment1_id` : sql``}
      `

      const queryRows = await rows<{
        coaId: string
        segmentDetailId?: string | null
        opening: string | number
      }>(query)
      for (const r of queryRows) {
        const coaId = String(r.coaId)
        const segmentDetailId = opts.bySegment ? String(r.segmentDetailId ?? '') : undefined
        const key = `${coaId}|${segmentDetailId ?? ''}`
        const current = resultMap.get(key)
        const opening = D(current?.opening ?? 0).plus(D(r.opening || 0)).toFixed(2)
        resultMap.set(key, { coaId, segmentDetailId, opening })
      }
    }
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
  /** GL tables to read when no periods are given (a plain date range); defaults to the active table `gl`. */
  tables?: string[]
  limit?: number
  offset?: number
}

/**
 * One page of journal lines, newest first. When the periods span several GL tables, each table
 * returns its first `offset + limit` lines and the pages are merged into one global order.
 */
export async function journalLines(opts: JournalLinesOptions): Promise<JournalLineRow[]> {
  const limit = opts.limit ?? 200
  const offset = opts.offset ?? 0

  if (opts.coaIds && opts.coaIds.length === 0) return []
  if (opts.segIds && opts.segIds !== 'all' && opts.segIds.length === 0) return []
  if (opts.segCol) assertSegmentColumn(opts.segCol)

  // If periods provided, group by table; otherwise read the given tables (default: active table 'gl')
  const periods = opts.periods ?? []
  const grouped: Map<string, Period[]> =
    periods.length > 0
      ? groupPeriodsByTable(periods)
      : new Map((opts.tables && opts.tables.length > 0 ? opts.tables : ['gl']).map((t) => [t, []]))
  const multiTable = grouped.size > 1
  const perTableLimit = multiTable ? offset + limit : limit
  const perTableOffset = multiTable ? 0 : offset

  const pages: JournalLineRow[][] = []

  for (const [tableName, tablePeriods] of grouped.entries()) {
    const { gl, glDetail } = glTablesOf(tableName)
    const glIdent = sql.identifier(gl)
    const glDetailIdent = sql.identifier(glDetail)

    const periodIdList = tablePeriods.map((p) => p.periodeId)
    const periodClause =
      periodIdList.length > 0
        ? sql`AND g.period_id IN (${inList(periodIdList)})`
        : opts.startDate && opts.endDate
          ? sql`AND g.trans_date >= ${opts.startDate} AND g.trans_date <= ${opts.endDate}`
          : sql``

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
             d.coa_id AS coaId,
             SUM(d.debet) AS debet,
             SUM(d.credit) AS credit
      FROM ${glIdent} g
      JOIN ${glDetailIdent} d ON d.gl_id = g.gl_id
      WHERE g.posted_status = 1
        AND g.canceled_date IS NULL
        ${periodClause}
        ${coaClause}
        ${segClause}
      GROUP BY g.gl_id, g.journal_number, DATE(g.trans_date), g.journal_type, g.memo, d.coa_id
      ORDER BY g.trans_date DESC, g.gl_id DESC, d.coa_id
      LIMIT ${perTableLimit} OFFSET ${perTableOffset}
    `

    const queryRows = await rows<{
      glId: string | number
      journalNumber: string
      transDate: string
      journalType: number
      memo: string
      coaId: string | number
      debet: string | number
      credit: string | number
    }>(query)

    pages.push(
      queryRows.map((r) => ({
        glId: String(r.glId),
        journalNumber: r.journalNumber || '',
        transDate: String(r.transDate).slice(0, 10),
        journalType: Number(r.journalType) || 0,
        memo: r.memo || '',
        coaId: String(r.coaId),
        debet: D(r.debet || 0).toFixed(2),
        credit: D(r.credit || 0).toFixed(2),
      })),
    )
  }

  return multiTable ? mergeJournalPages(pages, offset, limit) : (pages[0] ?? [])
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
