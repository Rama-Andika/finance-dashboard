import { D, sum } from '../../core/money'
import { isBalanceSheetGroup } from '../coa/account-groups'
import { combineBalances } from '../period/balance'
import {
  computeEarnings,
  planEarnings,
  profitByPeriod,
  type Earnings,
  type EarningsAccounts,
  type EarningsPlan,
} from './earnings'
import { byStartThenType, planBalanceSources, type BalanceSourcePlan } from './sources'
import { CURRENT_EARNINGS_NODE_ID, PRIOR_EARNINGS_NODE_ID, type ExtraLine } from './statement'
import type { BalanceTarget } from './targets'
import type { CoaTree } from '../coa/coa-tree'
import type { AccountGroup, Id, Money, Period } from '../../core/types'

/** What has to be known before any journal is read: how the balance is reached and which periods must be loaded. */
export type BalancePlan = {
  plan: BalanceSourcePlan
  earningsPlan: EarningsPlan
  /** Every period whose movements are needed (for the balances and for the profit lines), oldest first. */
  periodsToLoad: Period[]
}

export function planBalance(input: {
  periods: readonly Period[]
  target: BalanceTarget
  /** The period after the last Closed period (from `pickOpeningPeriod`). */
  openingPeriod: Period | null
  /** Whether that period has saved opening balances. */
  openingExists: boolean
  fiscalEndMonth: number
}): BalancePlan {
  const plan = planBalanceSources(input)
  const earningsPlan = planEarnings({
    periods: input.periods,
    target: input.target,
    plan,
    fiscalEndMonth: input.fiscalEndMonth,
  })
  const byId = new Map<Id, Period>()
  for (const p of [...plan.movementPeriods, ...earningsPlan.currentPeriods, ...earningsPlan.priorPeriods]) {
    byId.set(p.periodeId, p)
  }
  return { plan, earningsPlan, periodsToLoad: Array.from(byId.values()).sort(byStartThenType) }
}

export type AssembledBalances = {
  earnings: Earnings
  /** Balance of every postable balance sheet account, with the earnings applied to the two earnings accounts. */
  balances: Map<Id, Money>
  /** Earnings that have no account to sit on because the ERP account was not found; null when the account exists. */
  unplaced: { current: Money | null; prior: Money | null }
}

/**
 * The balance of every balance sheet account: opening balances plus the movements of the planned periods, then the
 * profit lines. `movements` may hold more periods than the plan uses (they are loaded for the profit lines too);
 * `openings` are the saved opening balances of `plan.openingPeriod` (ignored when the plan has none).
 */
export function assembleBalances(input: {
  tree: CoaTree
  plan: BalancePlan
  earningsAccounts: EarningsAccounts
  openings: ReadonlyArray<{ coaId: Id; opening: Money }>
  movements: ReadonlyArray<{ coaId: Id; periodId?: Id; debet: Money; credit: Money }>
}): AssembledBalances {
  const { tree, earningsAccounts } = input
  const { plan, earningsPlan } = input.plan

  const accounts = new Map<Id, { accountGroup: AccountGroup }>()
  for (const node of tree.byId.values()) {
    if (node.status === 'POSTABLE' && node.coaId !== tree.orphanFolderId && isBalanceSheetGroup(node.accountGroup)) {
      accounts.set(node.coaId, { accountGroup: node.accountGroup })
    }
  }

  const openings = plan.openingPeriod ? [...input.openings] : []
  const movementPeriodIds = new Set(plan.movementPeriods.map((p) => p.periodeId))
  const balanceMovements = input.movements.filter((m) => m.periodId !== undefined && movementPeriodIds.has(m.periodId))
  const balances = combineBalances(accounts, openings, balanceMovements)

  const profit = profitByPeriod(input.movements, (coaId) => tree.byId.get(coaId)?.accountGroup)
  const { currentId, priorId } = earningsAccounts
  const accountOpening = currentId ? sum(openings.filter((o) => o.coaId === currentId).map((o) => o.opening)) : '0.00'
  const accountMovement = currentId ? D(balances.get(currentId)).minus(D(accountOpening)).toFixed(2) : '0.00'
  const earnings = computeEarnings({
    earningsPlan,
    movementPeriods: plan.movementPeriods,
    profit,
    accountOpening,
    accountMovement,
  })

  if (currentId) balances.set(currentId, earnings.current)
  if (priorId) balances.set(priorId, sum([balances.get(priorId), earnings.priorAddition]))

  return {
    earnings,
    balances,
    unplaced: {
      current: currentId ? null : earnings.current,
      prior: priorId ? null : earnings.priorAddition,
    },
  }
}

/** The earnings lines the report adds itself, for the earnings accounts that were not found (same for both dates). */
export function extraLinesOf(primary: AssembledBalances, compare: AssembledBalances | null): ExtraLine[] {
  const lines: ExtraLine[] = []
  const compareOf = (amount: Money | null | undefined): Money | null => (compare ? (amount ?? '0.00') : null)

  if (primary.unplaced.current !== null) {
    lines.push({
      id: CURRENT_EARNINGS_NODE_ID,
      labelKey: 'currentYearEarnings',
      amount: primary.unplaced.current,
      compare: compareOf(compare?.unplaced.current),
    })
  }
  if (primary.unplaced.prior !== null) {
    const hasAmount = !D(primary.unplaced.prior).isZero() || !D(compare?.unplaced.prior).isZero()
    if (hasAmount) {
      lines.push({
        id: PRIOR_EARNINGS_NODE_ID,
        labelKey: 'priorYearsEarnings',
        amount: primary.unplaced.prior,
        compare: compareOf(compare?.unplaced.prior),
      })
    }
  }
  return lines
}
