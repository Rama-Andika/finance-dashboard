import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { glTablesOf, groupPeriodsByTable } from '~/server/db/gl-tables'
import { D } from '~/lib/finance/money'
import { glMovementsCache, hashIds } from '~/server/cache'
import type { AccountGroup, Id, IsoDate, Money, Period } from '~/lib/finance/types'

export type MovementRow = {
  coaId: Id
  periodId?: Id
  locationId?: Id
  debet: Money
  credit: Money
}

export type MovementsByPeriodsOptions = {
  periods: Period[]
  segCol: string
  segIds: Id[] | 'all'
  coaIds?: Id[]
  accountGroups?: AccountGroup[]
  byPeriod?: boolean
  byLocation?: boolean
}

function closedPeriodCacheKey(
  tableName: string,
  periodeId: string,
  opts: MovementsByPeriodsOptions,
): string {
  const segHash = hashIds(opts.segIds)
  const coaHash = hashIds(opts.coaIds)
  const grp = `p:${Boolean(opts.byPeriod)}|loc:${Boolean(opts.byLocation)}|g:${(opts.accountGroups || []).slice().sort().join(',')}`
  return `mv|${tableName}|${periodeId}|Closed|${segHash}|${coaHash}|${grp}`
}

async function queryMovementsFromDb(
  tableName: string,
  tablePeriods: Period[],
  opts: MovementsByPeriodsOptions,
): Promise<MovementRow[]> {
  if (tablePeriods.length === 0) return []

  const { gl, glDetail } = glTablesOf(tableName)
  const glIdent = sql.identifier(gl)
  const glDetailIdent = sql.identifier(glDetail)
  const segIdent = sql.identifier(opts.segCol)

  const periodIdList = tablePeriods.map((p) => p.periodeId)
  const periodChunks: string[][] = []
  for (let i = 0; i < periodIdList.length; i += 1000) {
    periodChunks.push(periodIdList.slice(i, i + 1000))
  }

  const coaChunks: (string[] | undefined)[] = []
  if (opts.coaIds && opts.coaIds.length > 0) {
    for (let i = 0; i < opts.coaIds.length; i += 1000) {
      coaChunks.push(opts.coaIds.slice(i, i + 1000))
    }
  } else {
    coaChunks.push(undefined)
  }

  const segChunks: (string[] | undefined)[] = []
  if (opts.segIds !== 'all') {
    if (opts.segIds.length === 0) return []
    for (let i = 0; i < opts.segIds.length; i += 1000) {
      segChunks.push(opts.segIds.slice(i, i + 1000))
    }
  } else {
    segChunks.push(undefined)
  }

  const resultRows: MovementRow[] = []

  for (const pChunk of periodChunks) {
    for (const cChunk of coaChunks) {
      for (const sChunk of segChunks) {
        const query = sql`
          SELECT d.coa_id AS coaId
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

  // Ensure segment column is valid
  if (!/^segment([1-9]|1[0-5])_id$/.test(opts.segCol)) {
    throw new Error(`Invalid segment column: ${opts.segCol}`)
  }

  const grouped = groupPeriodsByTable(opts.periods)
  const resultMap = new Map<string, MovementRow>()

  const mergeRows = (rowsToMerge: MovementRow[]) => {
    for (const r of rowsToMerge) {
      const key = `${r.coaId}|${r.periodId ?? ''}|${r.locationId ?? ''}`
      const existing = resultMap.get(key)
      if (existing) {
        existing.debet = D(existing.debet).plus(D(r.debet)).toFixed(2)
        existing.credit = D(existing.credit).plus(D(r.credit)).toFixed(2)
      } else {
        resultMap.set(key, { ...r })
      }
    }
  }

  for (const [tableName, tablePeriods] of grouped.entries()) {
    const openPeriods: Period[] = []

    for (const p of tablePeriods) {
      if (p.status === 'Closed') {
        const cacheKey = closedPeriodCacheKey(tableName, p.periodeId, opts)
        const hit = glMovementsCache.get(cacheKey)
        if (hit) {
          mergeRows(hit)
        } else {
          // Query single closed period, cache, and merge
          const pRows = await queryMovementsFromDb(tableName, [p], opts)
          glMovementsCache.set(cacheKey, pRows)
          mergeRows(pRows)
        }
      } else {
        // Open or Pre Closed periods are NEVER cached (D20)
        openPeriods.push(p)
      }
    }

    if (openPeriods.length > 0) {
      const openRows = await queryMovementsFromDb(tableName, openPeriods, opts)
      mergeRows(openRows)
    }
  }

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
}

export type DateMovementRow = {
  coaId: Id
  transDate?: IsoDate
  debet: Money
  credit: Money
}

export async function movementsByDate(opts: MovementsByDateOptions): Promise<DateMovementRow[]> {
  if (opts.tables.length === 0) return []
  if (opts.coaIds && opts.coaIds.length === 0) return []

  if (!/^segment([1-9]|1[0-5])_id$/.test(opts.segCol)) {
    throw new Error(`Invalid segment column: ${opts.segCol}`)
  }

  const resultMap = new Map<string, DateMovementRow>()

  for (const tableName of opts.tables) {
    const { gl, glDetail } = glTablesOf(tableName)
    const glIdent = sql.identifier(gl)
    const glDetailIdent = sql.identifier(glDetail)
    const segIdent = sql.identifier(opts.segCol)

    const coaChunks: (string[] | undefined)[] = []
    if (opts.coaIds && opts.coaIds.length > 0) {
      for (let i = 0; i < opts.coaIds.length; i += 1000) {
        coaChunks.push(opts.coaIds.slice(i, i + 1000))
      }
    } else {
      coaChunks.push(undefined)
    }

    const segChunks: (string[] | undefined)[] = []
    if (opts.segIds !== 'all') {
      if (opts.segIds.length === 0) return []
      for (let i = 0; i < opts.segIds.length; i += 1000) {
        segChunks.push(opts.segIds.slice(i, i + 1000))
      }
    } else {
      segChunks.push(undefined)
    }

    for (const cChunk of coaChunks) {
      for (const sChunk of segChunks) {
        const query = sql`
          SELECT d.coa_id AS coaId
                 ${opts.byDate ? sql`, DATE(g.trans_date) AS transDate` : sql``}
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
        `

        const queryRows = await rows<{
          coaId: string
          transDate?: string
          debet: string | number
          credit: string | number
        }>(query)

        for (const r of queryRows) {
          const coaId = String(r.coaId)
          const transDate = r.transDate ? String(r.transDate).slice(0, 10) : undefined
          const key = `${coaId}|${transDate ?? ''}`

          const existing = resultMap.get(key)
          if (existing) {
            existing.debet = D(existing.debet).plus(D(r.debet || 0)).toFixed(2)
            existing.credit = D(existing.credit).plus(D(r.credit || 0)).toFixed(2)
          } else {
            resultMap.set(key, {
              coaId,
              transDate,
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
  opening: Money
}

export async function openingBalances(opts: {
  periodeId: Id
  segCol: string
  segIds: Id[] | 'all'
  coaIds: Id[]
}): Promise<OpeningBalanceRow[]> {
  if (opts.coaIds.length === 0) return []

  // Ensure entity segment is segment1_id (Step 9.1 rule)
  if (opts.segCol !== 'segment1_id') {
    throw new Error('Entity segment is not segment1_id — user decision required')
  }

  const coaChunks: string[][] = []
  for (let i = 0; i < opts.coaIds.length; i += 1000) {
    coaChunks.push(opts.coaIds.slice(i, i + 1000))
  }

  const segChunks: (string[] | undefined)[] = []
  if (opts.segIds !== 'all') {
    if (opts.segIds.length === 0) return []
    for (let i = 0; i < opts.segIds.length; i += 1000) {
      segChunks.push(opts.segIds.slice(i, i + 1000))
    }
  } else {
    segChunks.push(undefined)
  }

  const resultMap = new Map<Id, Money>()

  for (const cChunk of coaChunks) {
    for (const sChunk of segChunks) {
      const query = sql`
        SELECT o.coa_id AS coaId, SUM(o.opening_balance) AS opening
        FROM coa_opening_balance_location o
        WHERE o.periode_id = ${opts.periodeId}
          AND o.coa_id IN (${inList(cChunk)})
          ${sChunk ? sql`AND o.segment1_id IN (${inList(sChunk)})` : sql``}
        GROUP BY o.coa_id
      `

      const queryRows = await rows<{ coaId: string; opening: string | number }>(query)
      for (const r of queryRows) {
        const coaId = String(r.coaId)
        const current = resultMap.get(coaId) ?? '0.00'
        resultMap.set(coaId, D(current).plus(D(r.opening || 0)).toFixed(2))
      }
    }
  }

  return Array.from(resultMap.entries()).map(([coaId, opening]) => ({ coaId, opening }))
}

export async function countOpeningRows(periodeId: Id): Promise<number> {
  const result = await rows<{ n: number | string }>(sql`
    SELECT COUNT(*) AS n
    FROM coa_opening_balance_location
    WHERE periode_id = ${periodeId}
  `)
  return Number(result[0]?.n ?? 0)
}

export async function journalLinesByGlIds(opts: {
  tables: string[]
  glIds: Id[]
}): Promise<
  Array<{
    glId: Id
    journalNumber: string
    transDate: string
    coaId: Id
    memo: string
    debet: Money
    credit: Money
  }>
> {
  if (opts.tables.length === 0 || opts.glIds.length === 0) return []

  const glChunks: string[][] = []
  for (let i = 0; i < opts.glIds.length; i += 1000) {
    glChunks.push(opts.glIds.slice(i, i + 1000))
  }

  const results: Array<{
    glId: Id
    journalNumber: string
    transDate: string
    coaId: Id
    memo: string
    debet: Money
    credit: Money
  }> = []

  for (const tableName of opts.tables) {
    const { gl, glDetail } = glTablesOf(tableName)
    const glIdent = sql.identifier(gl)
    const glDetailIdent = sql.identifier(glDetail)

    for (const chunk of glChunks) {
      const query = sql`
        SELECT g.gl_id AS glId, g.journal_number AS journalNumber, DATE(g.trans_date) AS transDate,
               d.coa_id AS coaId, d.memo AS memo, d.debet AS debet, d.credit AS credit
        FROM ${glIdent} g
        JOIN ${glDetailIdent} d ON d.gl_id = g.gl_id
        WHERE g.gl_id IN (${inList(chunk)})
        ORDER BY g.trans_date, g.gl_id, d.gl_detail_id
      `
      const queryRows = await rows<{
        glId: string
        journalNumber: string
        transDate: string
        coaId: string
        memo: string
        debet: string | number
        credit: string | number
      }>(query)

      for (const r of queryRows) {
        results.push({
          glId: String(r.glId),
          journalNumber: r.journalNumber || '',
          transDate: String(r.transDate).slice(0, 10),
          coaId: String(r.coaId),
          memo: r.memo || '',
          debet: D(r.debet || 0).toFixed(2),
          credit: D(r.credit || 0).toFixed(2),
        })
      }
    }
  }

  return results
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
  limit?: number
  offset?: number
}

export async function journalLines(opts: JournalLinesOptions): Promise<JournalLineRow[]> {
  const limit = opts.limit ?? 200
  const offset = opts.offset ?? 0

  // If periods provided, group by table; otherwise use active table 'gl'
  const periods = opts.periods ?? []
  const grouped = periods.length > 0 ? groupPeriodsByTable(periods) : new Map([['gl', []]])

  const results: JournalLineRow[] = []

  for (const [tableName, tablePeriods] of grouped.entries()) {
    const { gl, glDetail } = glTablesOf(tableName)
    const glIdent = sql.identifier(gl)
    const glDetailIdent = sql.identifier(glDetail)

    const periodIdList = tablePeriods.map((p) => p.periodeId)
    const periodClause =
      periodIdList.length > 0
        ? sql`AND g.period_id IN (${inList(periodIdList.slice(0, 1000))})`
        : opts.startDate && opts.endDate
          ? sql`AND g.trans_date >= ${opts.startDate} AND g.trans_date <= ${opts.endDate}`
          : sql``

    const coaClause =
      opts.coaIds && opts.coaIds.length > 0
        ? sql`AND d.coa_id IN (${inList(opts.coaIds.slice(0, 1000))})`
        : sql``

    const segClause =
      opts.segCol && opts.segIds && opts.segIds !== 'all' && opts.segIds.length > 0
        ? sql`AND d.${sql.identifier(opts.segCol)} IN (${inList(opts.segIds.slice(0, 1000))})`
        : sql``

    const query = sql`
      SELECT g.gl_id AS glId,
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
      ORDER BY g.trans_date DESC, g.gl_id DESC
      LIMIT ${limit} OFFSET ${offset}
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

    for (const r of queryRows) {
      results.push({
        glId: String(r.glId),
        journalNumber: r.journalNumber || '',
        transDate: String(r.transDate).slice(0, 10),
        journalType: Number(r.journalType) || 0,
        memo: r.memo || '',
        coaId: String(r.coaId),
        debet: D(r.debet || 0).toFixed(2),
        credit: D(r.credit || 0).toFixed(2),
      })
    }
  }

  return results
}
