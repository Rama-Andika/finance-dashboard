import { postableAccountIds } from '~/lib/finance/coa/coa-tree'
import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D, sum } from '~/lib/core/money'
import { signedAmount } from '~/lib/finance/coa/sign'
import type { AccountGroup, Id, MetricMeta, Money } from '~/lib/core/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
} from '~/server/context'
import { memoMetric } from '~/server/cache'
import { loadPlMovements, onlyAccounts } from '~/server/services/shared/pl-movements'
import { PNL_ACCOUNT_GROUPS as BUDGET_ACCOUNT_GROUPS, isIncomeGroup } from '~/lib/finance/coa/account-groups'
import { budgetAmounts } from '~/server/repo/budget.repo'
import {
  buildBudgetTree,
  computeVariance,
  monthToMonth0,
  type BudgetRow,
} from '~/lib/finance/pnl/budget'

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

export function computeBudget(filter: AppContextFilter): Promise<BudgetResult> {
  return memoMetric('budget', filter, () => computeBudgetUncached(filter))
}

async function computeBudgetUncached(filter: AppContextFilter): Promise<BudgetResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  // 1. Identify target CoA IDs
  const targetCoaIds: Id[] = postableAccountIds(tree, BUDGET_ACCOUNT_GROUPS)
  const coaGroupMap = new Map<Id, AccountGroup>(
    targetCoaIds.map((id) => [id, tree.byId.get(id)!.accountGroup]),
  )

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
  const actualMovements = onlyAccounts(await loadPlMovements(filter, filter.periodIds), targetCoaIds)

  const actualByCoa = new Map<Id, Money>()
  for (const m of actualMovements) {
    const group = coaGroupMap.get(m.coaId) ?? 'Expense'
    const net = signedAmount(group, m.debet, m.credit)

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
    if (isIncomeGroup(r.accountGroup)) {
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
