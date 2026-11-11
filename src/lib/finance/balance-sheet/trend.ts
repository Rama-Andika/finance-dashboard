import type Decimal from 'decimal.js'
import { D, addTo, sum } from '../../core/money'
import {
  ASSET_GROUPS,
  BALANCE_SHEET_GROUPS,
  LIABILITY_GROUPS,
  PNL_ACCOUNT_GROUPS,
  isBalanceSheetGroup,
} from '../coa/account-groups'
import { signedDecimal } from '../coa/sign'
import { isRegularPeriod } from '../period/period-type'
import type { CoaTree } from '../coa/coa-tree'
import type { AccountGroup, Id, IsoDate, Money, Period } from '../../core/types'

/** How many months the trend chart shows, the report month included. */
export const TREND_MONTHS = 12

/** The key under which the profit of a period is stored next to the six balance sheet groups. */
export const PROFIT_GROUP_KEY = 'Profit'

/** The total of each balance sheet group and the profit: what the snapshot stores and the live sum produces. */
export type GroupAmounts = Record<string, Money>

/** The regular periods that end with the report period, oldest first (fewer when there are not that many). */
export function trendPeriods(periods: readonly Period[], target: Period, count: number = TREND_MONTHS): Period[] {
  return periods
    .filter((p) => isRegularPeriod(p) && p.startDate <= target.startDate)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))
    .slice(-count)
}

export type TrendTotals = { assets: Money; liabilities: Money; equity: Money }

/**
 * The three totals of the chart from the amounts per group. Equity includes the profit of the period: until the books
 * are closed for the year the profit sits in the P&L accounts, and the balance sheet counts it as equity.
 */
export function totalsOfGroupAmounts(amounts: GroupAmounts): TrendTotals {
  const of = (groups: readonly AccountGroup[]): Money => sum(groups.map((group) => amounts[group]))
  return {
    assets: of(ASSET_GROUPS),
    liabilities: of(LIABILITY_GROUPS),
    equity: sum([amounts.Equity, amounts[PROFIT_GROUP_KEY]]),
  }
}

/** One month of the chart. `provisional`: the period is not closed yet; `source`: saved totals or the live sum. */
export type BalanceTrendPoint = TrendTotals & {
  periodId: Id
  name: string
  /** 'YYYY-MM' */
  monthKey: string
  endDate: IsoDate
  provisional: boolean
  source: 'snapshot' | 'live'
}

export type BalanceTrendResult = {
  points: BalanceTrendPoint[]
  /** Months of the window that could not be shown (not saved yet, and not reachable from the opening balances). */
  missingCount: number
}

export function trendPoint(
  period: Period,
  amounts: GroupAmounts,
  source: BalanceTrendPoint['source'],
): BalanceTrendPoint {
  return {
    ...totalsOfGroupAmounts(amounts),
    periodId: period.periodeId,
    name: period.name,
    monthKey: period.startDate.slice(0, 7),
    endDate: period.endDate,
    provisional: period.status !== 'Closed',
    source,
  }
}

/**
 * The amounts per group after each of the given periods, as a running sum: the saved opening balances, then the movements
 * period by period (oldest first). The profit is the running profit since the opening period. This is the live version
 * of what the snapshot stores for a closed period, and it gives every month between the opening and the report period
 * from one read. `endStates` says after which period to take the amounts of which period (the same period, or the report
 * period's period 13 when it is included).
 */
export function cumulativeGroupAmounts(input: {
  tree: CoaTree
  openings: ReadonlyArray<{ coaId: Id; opening: Money }>
  movements: ReadonlyArray<{ coaId: Id; periodId?: Id; debet: Money; credit: Money }>
  movementPeriods: readonly Period[]
  endStates: ReadonlyArray<{ periodId: Id; after: Id }>
}): Map<Id, GroupAmounts> {
  const { tree } = input
  const groupOf = (coaId: Id): AccountGroup | undefined => tree.byId.get(coaId)?.accountGroup

  const groups = new Map<AccountGroup, Decimal>(BALANCE_SHEET_GROUPS.map((group) => [group, D(0)]))
  let profit = D(0)
  for (const o of input.openings) {
    const group = groupOf(o.coaId)
    const current = group ? groups.get(group) : undefined
    if (group && current) groups.set(group, current.plus(D(o.opening)))
  }

  const movementsOf = new Map<Id, Array<(typeof input.movements)[number]>>()
  for (const m of input.movements) {
    if (!m.periodId) continue
    movementsOf.set(m.periodId, [...(movementsOf.get(m.periodId) ?? []), m])
  }
  const endsAfter = new Map<Id, Id[]>()
  for (const end of input.endStates) endsAfter.set(end.after, [...(endsAfter.get(end.after) ?? []), end.periodId])

  const result = new Map<Id, GroupAmounts>()
  for (const period of input.movementPeriods) {
    for (const m of movementsOf.get(period.periodeId) ?? []) {
      const group = groupOf(m.coaId)
      if (!group) continue
      if (isBalanceSheetGroup(group)) {
        addTo(groups, group, signedDecimal(group, m.debet, m.credit))
      } else if (PNL_ACCOUNT_GROUPS.includes(group)) {
        profit = profit.plus(D(m.credit)).minus(D(m.debet))
      }
    }
    for (const periodId of endsAfter.get(period.periodeId) ?? []) {
      const amounts: GroupAmounts = Object.fromEntries(
        Array.from(groups, ([group, total]) => [group, total.toFixed(2)]),
      )
      amounts[PROFIT_GROUP_KEY] = profit.toFixed(2)
      result.set(periodId, amounts)
    }
  }
  return result
}
