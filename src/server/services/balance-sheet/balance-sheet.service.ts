import '@tanstack/react-start/server-only'
import { memoMetric } from '~/server/cache'
import { buildMetricMeta, type AppContextFilter } from '~/server/context'
import {
  loadBalanceBase,
  loadBalanceContext,
  type BalanceContext,
} from '~/server/services/balance-sheet/balance-inputs'
import {
  assembleBalances,
  extraLinesOf,
  type AssembledBalances,
  type BalancePlan,
} from '~/lib/finance/balance-sheet/assemble'
import { fiscalYearStart } from '~/lib/finance/balance-sheet/fiscal-year'
import type { BalanceSheetPeriodInfo, BalanceSheetResult } from '~/lib/finance/balance-sheet/result'
import { buildBalanceSheet, emptyStatement } from '~/lib/finance/balance-sheet/statement'
import {
  resolveBalanceTarget,
  resolveCompareTarget,
  type BalanceCompareMode,
  type BalanceTarget,
} from '~/lib/finance/balance-sheet/targets'
import type { IsoDate } from '~/lib/core/types'

type Figures = { target: BalanceTarget; plan: BalancePlan; assembled: AssembledBalances }

/** The balances of one report date: which opening balances to use, which journals to add, and the result. */
async function figuresFor(context: BalanceContext, target: BalanceTarget): Promise<Figures> {
  const { plan, openings, movements } = await loadBalanceBase(context, target)
  const assembled = assembleBalances({
    tree: context.tree,
    plan,
    earningsAccounts: context.earningsAccounts,
    openings,
    movements,
  })
  return { target, plan, assembled }
}

function periodInfo(target: BalanceTarget, today: IsoDate): BalanceSheetPeriodInfo {
  const { period } = target
  return {
    id: period.periodeId,
    name: period.name,
    startDate: period.startDate,
    endDate: period.endDate,
    status: period.status,
    reportDate: period.endDate < today ? period.endDate : today,
  }
}

export function computeBalanceSheet(
  filter: AppContextFilter,
  compareMode: BalanceCompareMode,
): Promise<BalanceSheetResult> {
  return memoMetric('balanceSheet', { filter, compareMode }, () => computeBalanceSheetUncached(filter, compareMode))
}

async function computeBalanceSheetUncached(
  filter: AppContextFilter,
  compareMode: BalanceCompareMode,
): Promise<BalanceSheetResult> {
  const meta = buildMetricMeta(filter)
  const context = await loadBalanceContext(filter)
  const { tree, periods, fiscalEnd, earningsAccounts } = context

  const target = resolveBalanceTarget(periods, filter)
  if (!target) {
    return {
      meta: { ...meta, hasOpenPeriod: false },
      status: 'no-period',
      period: null,
      includesPeriod13: false,
      method: null,
      openingPeriodName: null,
      unclosedCount: 0,
      provisional: false,
      statement: emptyStatement(),
      compare: null,
      earnings: null,
      fiscal: {
        endMonth: fiscalEnd.endMonth,
        assumed: fiscalEnd.assumed,
        yearStart: fiscalYearStart(filter.asOf, fiscalEnd.endMonth),
      },
    }
  }

  const compareTarget = resolveCompareTarget(compareMode, target, periods, fiscalEnd.endMonth)
  const [primary, compare] = await Promise.all([
    figuresFor(context, target),
    compareTarget ? figuresFor(context, compareTarget) : Promise.resolve(null),
  ])

  const statement = buildBalanceSheet({
    tree,
    balances: primary.assembled.balances,
    compareBalances: compare?.assembled.balances ?? null,
    extraLines: extraLinesOf(primary.assembled, compare?.assembled ?? null),
  })
  const { plan } = primary.plan

  return {
    meta: { ...meta, hasOpenPeriod: plan.provisional },
    status: 'ok',
    period: periodInfo(target, filter.today),
    includesPeriod13: target.p13 !== null,
    method: plan.method,
    openingPeriodName: plan.openingPeriod?.name ?? null,
    unclosedCount: plan.unclosedCount,
    provisional: plan.provisional,
    statement,
    compare:
      compareMode === 'none'
        ? null
        : {
            mode: compareMode,
            period: compare ? periodInfo(compare.target, filter.today) : null,
            method: compare ? compare.plan.plan.method : null,
          },
    earnings: {
      ...primary.assembled.earnings,
      currentAccountFound: earningsAccounts.currentId !== null,
      priorAccountFound: earningsAccounts.priorId !== null,
    },
    fiscal: {
      endMonth: fiscalEnd.endMonth,
      assumed: fiscalEnd.assumed,
      yearStart: primary.plan.earningsPlan.fyStart,
    },
  }
}
