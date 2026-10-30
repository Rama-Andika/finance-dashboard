import { i18nLabel } from '../../core/i18n-label'
import Decimal from 'decimal.js'
import { D } from '../../core/money'
import { signedAmount } from '../coa/sign'
import type { Breakdown, Id, Money } from '../../core/types'
import { type CoaTree } from '../coa/coa-tree'

export type MonthCost = {
  month: string
  fixed: Money
  variable: Money
}

export type FixedCostMovement = {
  coaId: Id
  periodId: Id
  debet: Money
  credit: Money
}

type FixedCostInput = {
  fixedCoaIds: Set<Id>
  expenseCoaIds: Set<Id>
  movements: FixedCostMovement[]
  months: Array<{ month: string; periodIds: Id[] }>
  tree: CoaTree
}

export type FixedCostCalculation = {
  months: MonthCost[]
  averageFixed: Money
  byFolder: Breakdown[]
  basketEmpty: boolean
}

function addTo<K>(map: Map<K, Decimal>, key: K, amount: Decimal): void {
  map.set(key, (map.get(key) ?? D(0)).plus(amount))
}

/**
 * One pass over the movements: net expense per period (fixed = accounts of the basket, variable =
 * the other expense accounts) and per account over all movements. An account in both lists is fixed.
 */
function indexMovements(input: FixedCostInput) {
  const fixedByPeriod = new Map<Id, Decimal>()
  const variableByPeriod = new Map<Id, Decimal>()
  const totalByCoa = new Map<Id, Decimal>()

  for (const m of input.movements) {
    const net = D(signedAmount('Expense', m.debet, m.credit))
    addTo(totalByCoa, m.coaId, net)
    if (input.fixedCoaIds.has(m.coaId)) addTo(fixedByPeriod, m.periodId, net)
    else if (input.expenseCoaIds.has(m.coaId)) addTo(variableByPeriod, m.periodId, net)
  }
  return { fixedByPeriod, variableByPeriod, totalByCoa }
}

const sumPeriods = (byPeriod: Map<Id, Decimal>, periodIds: Id[]): Decimal =>
  periodIds.reduce((acc, periodId) => acc.plus(byPeriod.get(periodId) ?? D(0)), D(0))

/** Fixed cost accounts grouped under their parent folder, each with the total of all its movements. */
function fixedCostFolders(fixedCoaIds: Set<Id>, totalByCoa: Map<Id, Decimal>, tree: CoaTree): Breakdown[] {
  const parentGroups = new Map<string, { parentLabel: string; parentCode?: string; accounts: Breakdown[] }>()

  for (const coaId of fixedCoaIds) {
    const node = tree.byId.get(coaId)
    const parentNode = node?.parentId ? tree.byId.get(node.parentId) : undefined
    const parentKey = parentNode ? parentNode.coaId : '__root__'

    const group = parentGroups.get(parentKey) ?? {
      parentLabel: parentNode ? parentNode.name : i18nLabel('fixedCostRoot'),
      parentCode: parentNode?.code,
      accounts: [],
    }
    group.accounts.push({
      id: coaId,
      label: node?.name ?? `Account ${coaId}`,
      code: node?.code,
      amount: (totalByCoa.get(coaId) ?? D(0)).toFixed(2),
    })
    parentGroups.set(parentKey, group)
  }

  return Array.from(parentGroups, ([folderId, group]) => ({
    id: folderId,
    label: group.parentLabel,
    code: group.parentCode,
    amount: group.accounts.reduce((acc, account) => acc.plus(D(account.amount)), D(0)).toFixed(2),
    children: group.accounts,
  }))
}

/**
 * Computes monthly fixed and variable cost, average fixed cost, and folder breakdown.
 */
export function computeFixedCost(input: FixedCostInput): FixedCostCalculation {
  const { fixedCoaIds, months, tree } = input

  if (fixedCoaIds.size === 0) {
    return {
      months: months.map((m) => ({ month: m.month, fixed: '0.00', variable: '0.00' })),
      averageFixed: '0.00',
      byFolder: [],
      basketEmpty: true,
    }
  }

  const { fixedByPeriod, variableByPeriod, totalByCoa } = indexMovements(input)

  const monthResults = months.map((m) => ({
    month: m.month,
    fixed: sumPeriods(fixedByPeriod, m.periodIds),
    variable: sumPeriods(variableByPeriod, m.periodIds),
  }))
  const totalFixed = monthResults.reduce((acc, m) => acc.plus(m.fixed), D(0))

  return {
    months: monthResults.map((m) => ({ month: m.month, fixed: m.fixed.toFixed(2), variable: m.variable.toFixed(2) })),
    averageFixed: months.length > 0 ? totalFixed.div(months.length).toFixed(2) : '0.00',
    byFolder: fixedCostFolders(fixedCoaIds, totalByCoa, tree),
    basketEmpty: false,
  }
}
