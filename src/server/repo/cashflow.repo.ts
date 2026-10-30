import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk, chunkOrAll, sliceCombos } from '~/server/db/chunk'
import { assertSegmentColumn } from '~/server/db/segment-column'
import { glTablesOf, groupPeriodsByTable } from '~/server/db/gl-tables'
import { notCanceledClause, prefetchCanceledDateColumns } from '~/server/db/gl-columns'
import { D } from '~/lib/core/money'
import { hashIds, memo } from '~/server/cache'
import type { Id, Money, Period } from '~/lib/core/types'

const CASH_LINES_CACHE_MS = 60 * 1000

export type CashJournalLineRow = {
  glId: Id
  journalType: number
  periodId: Id
  coaId: Id
  segmentDetailId: Id | null
  debet: Money
  credit: Money
}

export type LinesOfCashJournalsOptions = {
  periods: Period[]
  segCol: string
  segIds: Id[] | 'all'
  cashCoaIds: Id[]
}

/**
 * linesOfCashJournals(): all lines of posted journals that touch cash & cash equivalents in the selected periods.
 * Memoized briefly: Cash Flow, Expense Paid and the drill-downs ask for the same lines, so callers
 * pass the same (widest) cash account list and share one read. The returned array is read-only.
 */
export function linesOfCashJournals(
  opts: LinesOfCashJournalsOptions,
): Promise<CashJournalLineRow[]> {
  if (opts.periods.length === 0 || opts.cashCoaIds.length === 0) return Promise.resolve([])
  if (opts.segIds !== 'all' && opts.segIds.length === 0) return Promise.resolve([])

  assertSegmentColumn(opts.segCol)
  const key = [
    'cashLines',
    opts.segCol,
    hashIds(opts.periods.map((p) => p.periodeId)),
    hashIds(opts.segIds),
    hashIds(opts.cashCoaIds),
  ].join('|')
  return memo(key, CASH_LINES_CACHE_MS, () => queryCashLines(opts))
}

async function queryCashLines(opts: LinesOfCashJournalsOptions): Promise<CashJournalLineRow[]> {
  const grouped = groupPeriodsByTable(opts.periods)
  // A journal that matches in two slices (account or segment lists above 1000 ids) comes back once per slice.
  const unique = new Map<string, CashJournalLineRow>()

  await prefetchCanceledDateColumns(grouped.keys())
  for (const [tableName, tablePeriods] of grouped.entries()) {
    const { gl, glDetail } = glTablesOf(tableName)
    const glIdent = sql.identifier(gl)
    const glDetailIdent = sql.identifier(glDetail)
    const segIdent = sql.identifier(opts.segCol)
    const notCanceledMain = await notCanceledClause(tableName, 'g')
    const notCanceledSub = await notCanceledClause(tableName, 'g2')

    for (const [pChunk, cChunk, sChunk] of sliceCombos(chunk(tablePeriods.map((p) => p.periodeId)), chunk(opts.cashCoaIds), chunkOrAll(opts.segIds))) {
      const query = sql`
        SELECT d.gl_id AS glId,
               g.journal_type AS journalType,
               g.period_id AS periodId,
               d.coa_id AS coaId,
               d.${segIdent} AS segmentDetailId,
               SUM(d.debet) AS debet,
               SUM(d.credit) AS credit
        FROM ${glIdent} g
        JOIN ${glDetailIdent} d ON d.gl_id = g.gl_id
        JOIN (
          -- STRAIGHT_JOIN: start from the selected periods, not from the cash accounts' full history
          SELECT DISTINCT STRAIGHT_JOIN d2.gl_id
          FROM ${glIdent} g2
          JOIN ${glDetailIdent} d2 ON d2.gl_id = g2.gl_id
          WHERE g2.posted_status = 1
            ${notCanceledSub}
            AND g2.period_id IN (${inList(pChunk)})
            AND d2.coa_id IN (${inList(cChunk)})
            ${sChunk ? sql`AND d2.${segIdent} IN (${inList(sChunk)})` : sql``}
        ) k ON k.gl_id = g.gl_id
        WHERE g.posted_status = 1
          ${notCanceledMain}
        GROUP BY d.gl_id, g.journal_type, g.period_id, d.coa_id, d.${segIdent}
      `

      const res = await rows<{
        glId: string
        journalType: number | string
        periodId: string
        coaId: string
        segmentDetailId: string | null
        debet: number | string
        credit: number | string
      }>(query)

      for (const r of res) {
        const line: CashJournalLineRow = {
          glId: String(r.glId),
          journalType: Number(r.journalType) || 0,
          periodId: String(r.periodId),
          coaId: String(r.coaId),
          segmentDetailId: r.segmentDetailId ? String(r.segmentDetailId) : null,
          debet: D(r.debet || 0).toFixed(2),
          credit: D(r.credit || 0).toFixed(2),
        }
        unique.set(`${line.glId}|${line.coaId}|${line.segmentDetailId ?? ''}`, line)
      }
    }
  }

  return Array.from(unique.values())
}

export type CashFlowSetupRow = {
  setupId: Id
  groupId: Id
  groupName: string
  groupSequence: number
  subGroup: string
  subSequence: number
  coaId: Id | null
  valueDisplayed: 0 | 1
  accountGroup: string | null
  subAccountGroup: string | null
}

/**
 * cashFlowSetup()
 */
export async function getCashFlowSetup(): Promise<CashFlowSetupRow[]> {
  const query = sql`
    SELECT s.cash_flow_setup_id AS setupId,
           s.cash_flow_group_id AS groupId,
           grp.NAME AS groupName,
           grp.sequence AS groupSequence,
           s.sub_group AS subGroup,
           s.sequence_sub_group AS subSequence,
           s.coa_id AS coaId,
           s.value_displayed AS valueDisplayed,
           c.account_group AS accountGroup,
           c.sub_account_group AS subAccountGroup
    FROM cash_flow_setup s
    JOIN cash_flow_group grp ON grp.cash_flow_group_id = s.cash_flow_group_id
    LEFT JOIN coa c ON c.coa_id = s.coa_id
    ORDER BY grp.sequence, s.sequence_sub_group
  `

  const res = await rows<{
    setupId: string
    groupId: string
    groupName: string
    groupSequence: number | string
    subGroup: string
    subSequence: number | string
    coaId: string | null
    valueDisplayed: number | string
    accountGroup: string | null
    subAccountGroup: string | null
  }>(query)

  return res.map((r) => ({
    setupId: String(r.setupId),
    groupId: String(r.groupId),
    groupName: r.groupName || '',
    groupSequence: Number(r.groupSequence) || 0,
    subGroup: r.subGroup || '',
    subSequence: Number(r.subSequence) || 0,
    coaId: r.coaId ? String(r.coaId) : null,
    valueDisplayed: Number(r.valueDisplayed) === 1 ? 1 : 0,
    accountGroup: r.accountGroup,
    subAccountGroup: r.subAccountGroup,
  }))
}
