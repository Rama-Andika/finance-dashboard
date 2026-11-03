import { activePeriodsOf } from '~/lib/filters/filter-scope'
import { postableAccountIds } from '~/lib/finance/coa/coa-tree'
import '@tanstack/react-start/server-only'
import type { Breakdown, Id, MetricMeta, Money } from '~/lib/core/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedPeriods,
} from '~/server/context'
import { loadResolvedBaskets } from '~/server/services/shared/resolved-baskets'
import { memoMetric } from '~/server/cache'
import { loadPlMovements, onlyAccounts } from '~/server/services/pnl/pl-movements'
import {
  computeFixedCost as calculateFixedCost,
  type MonthCost,
  type FixedCostMovement,
} from '~/lib/finance/pnl/fixed-cost'

export type FixedCostResult = {
  meta: MetricMeta
  months: MonthCost[]
  averageFixed: Money
  byFolder: Breakdown[]
  basketEmpty: boolean
}

export function computeFixedCost(filter: AppContextFilter): Promise<FixedCostResult> {
  return memoMetric('fixedCost', filter, () => computeFixedCostUncached(filter))
}

async function computeFixedCostUncached(filter: AppContextFilter): Promise<FixedCostResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()

  const resolved = await loadResolvedBaskets(tree)

  const fixedCoaIds = new Set(resolved.fixedCost)
  const expenseCoaIds = new Set<Id>(postableAccountIds(tree, ['Expense']))

  const activePeriods = activePeriodsOf(periods, filter.periodIds)
  const monthsData = filter.months.map((m) => ({
    month: m,
    periodIds: activePeriods
      .filter((p) => p.startDate.slice(0, 7) === m)
      .map((p) => p.periodeId),
  }))

  if (fixedCoaIds.size === 0 || filter.periodIds.length === 0) {
    return {
      meta,
      months: filter.months.map((m) => ({
        month: m,
        fixed: '0.00',
        variable: '0.00',
      })),
      averageFixed: '0.00',
      byFolder: [],
      basketEmpty: fixedCoaIds.size === 0,
    }
  }

  const targetCoaIds = Array.from(new Set([...fixedCoaIds, ...expenseCoaIds]))
  const rawMovements = onlyAccounts(await loadPlMovements(filter, filter.periodIds), targetCoaIds)

  const movements: FixedCostMovement[] = rawMovements.map((m) => ({
    coaId: m.coaId,
    periodId: m.periodId ?? '',
    debet: m.debet,
    credit: m.credit,
  }))

  const res = calculateFixedCost({
    fixedCoaIds,
    expenseCoaIds,
    movements,
    months: monthsData,
    tree,
  })

  return {
    meta,
    months: res.months,
    averageFixed: res.averageFixed,
    byFolder: res.byFolder,
    basketEmpty: res.basketEmpty,
  }
}
