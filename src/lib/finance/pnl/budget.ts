import Decimal from 'decimal.js'
import { isIncomeGroup } from '../coa/account-groups'
import { signedDecimal } from '../coa/sign'
import { D, addTo, safeDiv } from '../../core/money'
import { formatPercent } from '~/lib/format/number'
import type { AccountGroup, Id, Money } from '../../core/types'
import { type CoaTree, type CoaNode, ORPHAN_FOLDER_ID } from '../coa/coa-tree'

export type BudgetRow = {
  coaId: Id
  code: string
  name: string
  accountGroup: AccountGroup
  actual: Money
  budget: Money
  variance: Money
  variancePercent: string | null
  higherIsBetter: boolean
  children?: BudgetRow[]
}

/**
 * 0-indexed month from 1-indexed month (October 10 -> 9, G23).
 */
export function monthToMonth0(month1: number): number {
  return month1 - 1
}

/**
 * Higher is better: true for Revenue & Other Revenue; false for costs/expenses.
 */
export function isHigherBetter(group: AccountGroup): boolean {
  return isIncomeGroup(group)
}

/**
 * Computes variance and percentage.
 */
export function computeVariance(
  actual: Money,
  budget: Money,
): {
  variance: Money
  variancePercent: string | null
} {
  const act = D(actual)
  const bgt = D(budget)
  const diff = act.minus(bgt)

  if (bgt.isZero()) {
    return {
      variance: diff.toFixed(2),
      variancePercent: null,
    }
  }

  const ratio = safeDiv(diff.toFixed(2), bgt.abs().toFixed(2))
  const variancePercent = ratio ? formatPercent(ratio, 'en', 1) : null

  return {
    variance: diff.toFixed(2),
    variancePercent,
  }
}

/**
 * Builds budget vs actual tree with headers aggregated from leaf postable accounts.
 */
export function buildBudgetTree(input: {
  tree: CoaTree
  accountGroups: readonly AccountGroup[]
  actualByCoa: Map<Id, Money>
  budgetByCoa: Map<Id, Money>
}): BudgetRow[] {
  const { tree, accountGroups, actualByCoa, budgetByCoa } = input

  const results: BudgetRow[] = []

  // Group by accountGroup
  for (const group of accountGroups) {
    const higherBetter = isHigherBetter(group)

    // Find all postable accounts for this group
    const postables: CoaNode[] = []
    for (const node of tree.byId.values()) {
      if (node.status === 'POSTABLE' && node.accountGroup === group && node.coaId !== ORPHAN_FOLDER_ID) {
        postables.push(node)
      }
    }

    if (postables.length === 0) continue

    let groupActual = D(0)
    let groupBudget = D(0)
    const children: BudgetRow[] = []

    for (const p of postables) {
      const act = actualByCoa.get(p.coaId) ?? '0.00'
      const bgt = budgetByCoa.get(p.coaId) ?? '0.00'

      groupActual = groupActual.plus(D(act))
      groupBudget = groupBudget.plus(D(bgt))

      const { variance, variancePercent } = computeVariance(act, bgt)

      children.push({
        coaId: p.coaId,
        code: p.code,
        name: p.name,
        accountGroup: group,
        actual: act,
        budget: bgt,
        variance,
        variancePercent,
        higherIsBetter: higherBetter,
      })
    }

    const { variance: gVar, variancePercent: gVarPct } = computeVariance(groupActual.toFixed(2), groupBudget.toFixed(2))

    results.push({
      coaId: `group_${group}`,
      code: '',
      name: group,
      accountGroup: group,
      actual: groupActual.toFixed(2),
      budget: groupBudget.toFixed(2),
      variance: gVar,
      variancePercent: gVarPct,
      higherIsBetter: higherBetter,
      children,
    })
  }

  return results
}

/**
 * Net actual amount per account, signed by the account's group (accounts of an unknown group count as Expense).
 * Rows are added as exact decimals and rounded once per account.
 */
export function actualByCoaOf(
  movements: readonly { coaId: Id; debet: Money; credit: Money }[],
  groupByCoa: ReadonlyMap<Id, AccountGroup>,
): Map<Id, Money> {
  const sums = new Map<Id, Decimal>()
  for (const m of movements) {
    const net = signedDecimal(groupByCoa.get(m.coaId) ?? 'Expense', m.debet, m.credit)
    addTo(sums, m.coaId, net)
  }
  return new Map(Array.from(sums, ([coaId, amount]) => [coaId, amount.toFixed(2)]))
}

/** Budget amount per account (a row is one account and month). */
export function budgetByCoaOf(rows: readonly { coaId: Id; amount: Money }[]): Map<Id, Money> {
  const sums = new Map<Id, Decimal>()
  for (const b of rows) addTo(sums, b.coaId, D(b.amount))
  return new Map(Array.from(sums, ([coaId, amount]) => [coaId, amount.toFixed(2)]))
}

/** The budget table is read per year with 0-based months (G23): 'YYYY-MM' keys become `{ year, months0 }`. */
export function budgetYearMonths(months: readonly string[]): Array<{ year: number; months0: number[] }> {
  const byYear = new Map<number, Set<number>>()
  for (const key of months) {
    const [year, month1] = key.split('-').map(Number)
    if (!year || !month1) continue
    const set = byYear.get(year) ?? new Set<number>()
    set.add(monthToMonth0(month1))
    byYear.set(year, set)
  }
  return Array.from(byYear, ([year, set]) => ({ year, months0: Array.from(set) }))
}

/** Net profit of the table, actual and budget: income groups minus costs and expenses. */
export function summarizeBudget(rows: readonly Pick<BudgetRow, 'accountGroup' | 'actual' | 'budget'>[]): {
  actual: Decimal
  budget: Decimal
} {
  let actual = D(0)
  let budget = D(0)
  for (const r of rows) {
    if (isIncomeGroup(r.accountGroup)) {
      actual = actual.plus(D(r.actual))
      budget = budget.plus(D(r.budget))
    } else {
      actual = actual.minus(D(r.actual))
      budget = budget.minus(D(r.budget))
    }
  }
  return { actual, budget }
}
