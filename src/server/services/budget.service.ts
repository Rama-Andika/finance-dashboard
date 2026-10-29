import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D, sum } from '~/lib/finance/money'
import type { AccountGroup, Id, MetricMeta, Money } from '~/lib/finance/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedPeriods,
} from '~/server/context'
import { movementsByPeriods } from '~/server/repo/gl.repo'
import { budgetAmounts } from '~/server/repo/budget.repo'
import {
  buildBudgetTree,
  computeVariance,
  monthToMonth0,
  type BudgetRow,
} from '~/lib/finance/budget'

export type BudgetResult = {
  meta: MetricMeta
  rows: BudgetRow[]
  summary: {
    actual: Money
    budget: Money
    variance: Money
    variancePercent: string | null
  }
}

const BUDGET_ACCOUNT_GROUPS: AccountGroup[] = [
  'Revenue',
  'Cost Of Sales',
  'Expense',
  'Other Revenue',
  'Other Expense',
]

export async function computeBudget(
  filter: AppContextFilter,
): Promise<BudgetResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()

  // 1. Identify target CoA IDs
  const targetCoaIds: Id[] = []
  const coaGroupMap = new Map<Id, AccountGroup>()

  for (const node of tree.byId.values()) {
    if (
      node.status === 'POSTABLE' &&
      BUDGET_ACCOUNT_GROUPS.includes(node.accountGroup) &&
      node.coaId !== '__orphans__'
    ) {
      targetCoaIds.push(node.coaId)
      coaGroupMap.set(node.coaId, node.accountGroup)
    }
  }

  if (targetCoaIds.length === 0 || filter.periodIds.length === 0) {
    return {
      meta,
      rows: [],
      summary: {
        actual: '0.00',
        budget: '0.00',
        variance: '0.00',
        variancePercent: null,
      },
    }
  }

  // 2. Fetch Actual movements
  const activePeriods = periods.filter((p) => filter.periodIds.includes(p.periodeId))
  const actualMovements = await movementsByPeriods({
    periods: activePeriods,
    segCol: filter.entitySegmentColumn,
    segIds: filter.segmentDetailIds,
    coaIds: targetCoaIds,
  })

  const actualByCoa = new Map<Id, Money>()
  for (const m of actualMovements) {
    const group = coaGroupMap.get(m.coaId)
    const net =
      group === 'Revenue' || group === 'Other Revenue'
        ? D(m.credit).minus(D(m.debet))
        : D(m.debet).minus(D(m.credit))

    const curr = actualByCoa.get(m.coaId) ?? '0.00'
    actualByCoa.set(m.coaId, D(curr).plus(net).toFixed(2))
  }

  // 3. Fetch Budget amounts
  const ymMap = new Map<number, Set<number>>()
  for (const m of filter.months) {
    const parts = m.split('-')
    const yr = Number(parts[0])
    const m1 = Number(parts[1])
    if (yr && m1) {
      const set = ymMap.get(yr) ?? new Set<number>()
      set.add(monthToMonth0(m1))
      ymMap.set(yr, set)
    }
  }

  const yearMonths = Array.from(ymMap.entries()).map(([year, mSet]) => ({
    year,
    months0: Array.from(mSet),
  }))

  const rawBudget = await budgetAmounts({
    budgetType: 1, // Budget vs Actual
    yearMonths,
    segIds: filter.segmentDetailIds,
    segCol: filter.entitySegmentColumn,
  })

  const budgetByCoa = new Map<Id, Money>()
  for (const b of rawBudget) {
    const curr = budgetByCoa.get(b.coaId) ?? '0.00'
    budgetByCoa.set(b.coaId, D(curr).plus(D(b.amount)).toFixed(2))
  }

  // 4. Build Tree
  const rows = buildBudgetTree({
    tree,
    accountGroups: BUDGET_ACCOUNT_GROUPS,
    actualByCoa,
    budgetByCoa,
  })

  // 5. Total summary (Net Profit actual vs budget)
  // Revenue + Other Revenue - (COGS + Expense + Other Expense)
  let actSummary = D(0)
  let bgtSummary = D(0)

  for (const r of rows) {
    const isIncome = r.accountGroup === 'Revenue' || r.accountGroup === 'Other Revenue'
    if (isIncome) {
      actSummary = actSummary.plus(D(r.actual))
      bgtSummary = bgtSummary.plus(D(r.budget))
    } else {
      actSummary = actSummary.minus(D(r.actual))
      bgtSummary = bgtSummary.minus(D(r.budget))
    }
  }

  const { variance, variancePercent } = computeVariance(
    actSummary.toFixed(2),
    bgtSummary.toFixed(2),
  )

  return {
    meta,
    rows,
    summary: {
      actual: actSummary.toFixed(2),
      budget: bgtSummary.toFixed(2),
      variance,
      variancePercent,
    },
  }
}
