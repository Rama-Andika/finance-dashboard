import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunkOrAll } from '~/server/db/chunk'
import { assertSegmentColumn } from '~/server/db/segment-column'
import { D } from '~/lib/core/money'
import type { Id, Money } from '~/lib/core/types'

export type BudgetAmountRow = {
  coaId: Id
  bgtYear: number
  bgtMonth: number // 0-indexed: 0 = Jan, 9 = Oct (G23)
  amount: Money
}

export type BudgetQueryParams = {
  budgetType: number // 1 = Budget vs Actual, 2 = Target Operasional
  yearMonths: Array<{ year: number; months0: number[] }>
  segIds: Id[] | 'all'
  segCol?: string
}

/**
 * budgetAmounts(budgetType, yearMonths, segIds, segCol)
 * Aggregates budget amounts from coa_budget grouped by coa_id, bgt_year, and bgt_month.
 */
export async function budgetAmounts(
  params: BudgetQueryParams,
): Promise<BudgetAmountRow[]> {
  if (params.yearMonths.length === 0) return []
  if (params.segIds !== 'all' && params.segIds.length === 0) return []

  const segCol = assertSegmentColumn(params.segCol || 'segment1_id')
  const segIdent = sql.identifier(segCol)

  // Construct OR clauses for year-months
  const ymClauses = params.yearMonths.map((ym) => {
    return sql`(b.bgt_year = ${ym.year} AND b.bgt_month IN (${inList(ym.months0.map(String))}))`
  })

  // Combine clauses with OR
  let combinedYm = ymClauses[0]!
  for (let i = 1; i < ymClauses.length; i++) {
    combinedYm = sql`${combinedYm} OR ${ymClauses[i]!}`
  }

  const results: BudgetAmountRow[] = []

  for (const sChunk of chunkOrAll(params.segIds)) {
    const query = sql`
      SELECT b.coa_id AS coaId,
             b.bgt_year AS bgtYear,
             b.bgt_month AS bgtMonth,
             SUM(b.amount) AS amount
      FROM coa_budget b
      JOIN coa c ON c.coa_id = b.coa_id
      WHERE b.budget_type = ${params.budgetType}
        AND (${combinedYm})
        ${sChunk ? sql`AND b.${segIdent} IN (${inList(sChunk)})` : sql``}
      GROUP BY b.coa_id, b.bgt_year, b.bgt_month
    `

    const res = await rows<{
      coaId: string
      bgtYear: number | string
      bgtMonth: number | string
      amount: number | string
    }>(query)

    for (const r of res) {
      results.push({
        coaId: String(r.coaId),
        bgtYear: Number(r.bgtYear) || 1900,
        bgtMonth: Number(r.bgtMonth) || 0,
        amount: D(r.amount || 0).toFixed(2),
      })
    }
  }

  return results
}
