import '@tanstack/react-start/server-only'
import { postableAccountIds } from '~/lib/finance/coa/coa-tree'
import type { AccountGroup, Id, MetricMeta, Money } from '~/lib/core/types'
import { type AppContextFilter, buildMetricMeta, getCachedCoaTree } from '~/server/context'
import { memoMetric } from '~/server/cache'
import { loadPlMovements, onlyAccounts } from '~/server/services/pnl/pl-movements'
import { PNL_ACCOUNT_GROUPS } from '~/lib/finance/coa/account-groups'
import { budgetAmounts } from '~/server/repo/pnl/budget.repo'
import {
  actualByCoaOf,
  budgetByCoaOf,
  budgetYearMonths,
  buildBudgetTree,
  computeVariance,
  summarizeBudget,
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

/** `budget_type` of the budget rows the Budget page compares with the actuals (2 = operational target, not used here). */
const BUDGET_VS_ACTUAL = 1

export function computeBudget(filter: AppContextFilter): Promise<BudgetResult> {
  return memoMetric('budget', filter, () => computeBudgetUncached(filter))
}

async function computeBudgetUncached(filter: AppContextFilter): Promise<BudgetResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  // 1. Identify target CoA IDs
  const targetCoaIds: Id[] = postableAccountIds(tree, PNL_ACCOUNT_GROUPS)
  const coaGroupMap = new Map<Id, AccountGroup>(targetCoaIds.map((id) => [id, tree.byId.get(id)!.accountGroup]))

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

  // 2. Actual movements and budget amounts are independent reads
  const [allMovements, rawBudget] = await Promise.all([
    loadPlMovements(filter, filter.periodIds),
    budgetAmounts({
      budgetType: BUDGET_VS_ACTUAL,
      yearMonths: budgetYearMonths(filter.months),
      segIds: filter.segmentDetailIds,
      segCol: filter.entitySegmentColumn,
    }),
  ])
  const actualByCoa = actualByCoaOf(onlyAccounts(allMovements, targetCoaIds), coaGroupMap)
  const budgetByCoa = budgetByCoaOf(rawBudget)

  // 3. Build Tree
  const rows = buildBudgetTree({
    tree,
    accountGroups: PNL_ACCOUNT_GROUPS,
    actualByCoa,
    budgetByCoa,
  })

  // 4. Total summary (Net Profit actual vs budget): Revenue + Other Revenue - (COGS + Expense + Other Expense)
  const total = summarizeBudget(rows)
  const { variance, variancePercent } = computeVariance(total.actual.toFixed(2), total.budget.toFixed(2))

  return {
    meta,
    rows,
    summary: {
      actual: total.actual.toFixed(2),
      budget: total.budget.toFixed(2),
      variance,
      variancePercent,
    },
  }
}
