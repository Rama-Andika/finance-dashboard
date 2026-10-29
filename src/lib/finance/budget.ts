import Decimal from 'decimal.js'
import { D, safeDiv } from './money'
import { formatPercent } from '~/lib/format/number'
import type { AccountGroup, Id, Money } from './types'
import { type CoaTree, type CoaNode, postableDescendants } from './coa-tree'

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
 * YTD 0-indexed months from 0 to current month0 (e.g. Oct 9 -> [0, 1, ..., 9]).
 */
export function ytdMonths0(month0: number): number[] {
  const result: number[] = []
  for (let m = 0; m <= month0; m++) {
    result.push(m)
  }
  return result
}

/**
 * Higher is better: true for Revenue & Other Revenue; false for costs/expenses.
 */
export function isHigherBetter(group: AccountGroup): boolean {
  return group === 'Revenue' || group === 'Other Revenue'
}

/**
 * Computes variance and percentage.
 */
export function computeVariance(actual: Money, budget: Money): {
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
  accountGroups: AccountGroup[]
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
      if (
        node.status === 'POSTABLE' &&
        node.accountGroup === group &&
        node.coaId !== '__orphans__'
      ) {
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

    const { variance: gVar, variancePercent: gVarPct } = computeVariance(
      groupActual.toFixed(2),
      groupBudget.toFixed(2),
    )

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
