import '@tanstack/react-start/server-only'
import { memo, memoMetric } from '~/server/cache'
import { getCachedCoaTree, getCachedPeriods, type AppContextFilter } from '~/server/context'
import { readFiscalEndMonthRaw } from '~/server/repo/master-data/company.repo'
import { readSystemProperties } from '~/server/repo/master-data/system-property.repo'
import { countOpeningRows, movementsByPeriods, openingBalances, type MovementRow } from '~/server/repo/gl/gl.repo'
import { planBalance, type BalancePlan } from '~/lib/finance/balance-sheet/assemble'
import {
  CURRENT_EARNINGS_PROPERTY,
  PRIOR_EARNINGS_PROPERTY,
  resolveEarningsAccounts,
  type EarningsAccounts,
} from '~/lib/finance/balance-sheet/earnings'
import { DEFAULT_FISCAL_END_MONTH, fiscalEndMonthOf } from '~/lib/finance/balance-sheet/fiscal-year'
import type { BalanceTarget } from '~/lib/finance/balance-sheet/targets'
import { BALANCE_SHEET_GROUPS } from '~/lib/finance/coa/account-groups'
import { postableAccountIds, type CoaTree } from '~/lib/finance/coa/coa-tree'
import { pickOpeningPeriod } from '~/lib/finance/period/balance'
import type { Id, Period } from '~/lib/core/types'

const TEN_MINUTES = 10 * 60 * 1000

/** The last month of the fiscal year (1–12) and whether it had to be assumed because the ERP value is not usable. */
export type FiscalYearEnd = { endMonth: number; assumed: boolean }

export function loadFiscalYearEnd(): Promise<FiscalYearEnd> {
  return memo('balanceSheet:fiscalEnd', TEN_MINUTES, async () => {
    const valid = fiscalEndMonthOf(await readFiscalEndMonthRaw())
    return { endMonth: valid ?? DEFAULT_FISCAL_END_MONTH, assumed: valid === null }
  })
}

/** The two earnings accounts of the chart, found through the ERP system properties that hold their codes. */
export async function loadEarningsAccounts(tree: CoaTree): Promise<EarningsAccounts> {
  const properties = await memo('balanceSheet:earningsCodes', TEN_MINUTES, () =>
    readSystemProperties([CURRENT_EARNINGS_PROPERTY, PRIOR_EARNINGS_PROPERTY]),
  )
  return resolveEarningsAccounts(tree, {
    current: properties.get(CURRENT_EARNINGS_PROPERTY) ?? null,
    prior: properties.get(PRIOR_EARNINGS_PROPERTY) ?? null,
  })
}

type EntityScope = { entitySegmentColumn: string; segmentDetailIds: Id[] | 'all' }

/**
 * The movements of every account in the given periods, one row per account and period, read in ONE aggregation and
 * shared (the balance sheet needs the balance sheet accounts and the profit of the P&L accounts from the same rows).
 */
export function loadBalanceMovements(scope: EntityScope, periods: readonly Period[]): Promise<MovementRow[]> {
  if (periods.length === 0) return Promise.resolve([])
  return memoMetric(
    'balanceMovements',
    { periodIds: periods.map((p) => p.periodeId), segCol: scope.entitySegmentColumn, segIds: scope.segmentDetailIds },
    () =>
      movementsByPeriods({
        periods: [...periods],
        segCol: scope.entitySegmentColumn,
        segIds: scope.segmentDetailIds,
        byPeriod: true,
      }),
  )
}

/** Everything the balance calculations of one request share. */
export type BalanceContext = {
  filter: AppContextFilter
  tree: CoaTree
  periods: Period[]
  fiscalEnd: FiscalYearEnd
  earningsAccounts: EarningsAccounts
  /** Every postable balance sheet account (the accounts whose opening balances are read). */
  accountIds: Id[]
}

export async function loadBalanceContext(filter: AppContextFilter): Promise<BalanceContext> {
  const [tree, periods, fiscalEnd] = await Promise.all([getCachedCoaTree(), getCachedPeriods(), loadFiscalYearEnd()])
  const earningsAccounts = await loadEarningsAccounts(tree)
  return {
    filter,
    tree,
    periods,
    fiscalEnd,
    earningsAccounts,
    accountIds: postableAccountIds(tree, BALANCE_SHEET_GROUPS),
  }
}

/** What a balance needs from the database: the plan, the saved opening balances it starts from, and the journals to add. */
export type BalanceBase = {
  plan: BalancePlan
  openings: Array<{ coaId: Id; opening: string }>
  movements: MovementRow[]
}

/** Decides how the balance of a report date is reached (see `planBalance`) and reads what that plan needs. */
export async function loadBalanceBase(context: BalanceContext, target: BalanceTarget): Promise<BalanceBase> {
  const { filter, periods } = context
  const { opening } = pickOpeningPeriod(periods, target.period.startDate)
  const openingExists = opening ? (await countOpeningRows(opening.periodeId)) > 0 : false
  const plan = planBalance({
    periods,
    target,
    openingPeriod: opening,
    openingExists,
    fiscalEndMonth: context.fiscalEnd.endMonth,
  })

  const openingPeriod = plan.plan.openingPeriod
  const [openings, movements] = await Promise.all([
    openingPeriod
      ? openingBalances({
          periodeId: openingPeriod.periodeId,
          segCol: filter.entitySegmentColumn,
          segIds: filter.segmentDetailIds,
          coaIds: context.accountIds,
        })
      : Promise.resolve([]),
    loadBalanceMovements(filter, plan.periodsToLoad),
  ])
  return { plan, openings, movements }
}
