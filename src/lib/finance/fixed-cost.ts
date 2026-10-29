import Decimal from 'decimal.js'
import { D } from './money'
import { signedAmount } from './sign'
import type { Breakdown, Id, Money } from './types'
import { type CoaTree, type CoaNode, postableDescendants } from './coa-tree'

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

/**
 * Computes monthly fixed and variable cost, average fixed cost, and folder breakdown.
 */
export function computeFixedCost(input: {
  fixedCoaIds: Set<Id>
  expenseCoaIds: Set<Id>
  movements: FixedCostMovement[]
  months: Array<{ month: string; periodIds: Id[] }>
  tree: CoaTree
}): {
  months: MonthCost[]
  averageFixed: Money
  byFolder: Breakdown[]
  basketEmpty: boolean
} {
  const { fixedCoaIds, expenseCoaIds, movements, months, tree } = input

  if (fixedCoaIds.size === 0) {
    return {
      months: months.map((m) => ({
        month: m.month,
        fixed: '0.00',
        variable: '0.00',
      })),
      averageFixed: '0.00',
      byFolder: [],
      basketEmpty: true,
    }
  }

  // Index movements by periodId and coaId
  const byPeriodCoa = new Map<string, Decimal>()
  const totalByCoa = new Map<Id, Decimal>()

  for (const m of movements) {
    const net = D(signedAmount('Expense', m.debet, m.credit))
    const key = `${m.periodId}::${m.coaId}`
    byPeriodCoa.set(key, (byPeriodCoa.get(key) ?? D(0)).plus(net))

    totalByCoa.set(m.coaId, (totalByCoa.get(m.coaId) ?? D(0)).plus(net))
  }

  // Monthly fixed & variable
  let totalFixedSum = D(0)
  const monthResults: MonthCost[] = []

  for (const m of months) {
    let mFixed = D(0)
    let mVar = D(0)

    for (const pId of m.periodIds) {
      for (const coaId of fixedCoaIds) {
        const val = byPeriodCoa.get(`${pId}::${coaId}`)
        if (val) {
          mFixed = mFixed.plus(val)
        }
      }

      for (const coaId of expenseCoaIds) {
        // Exclude fixed cost accounts from variable costs
        if (!fixedCoaIds.has(coaId)) {
          const val = byPeriodCoa.get(`${pId}::${coaId}`)
          if (val) {
            mVar = mVar.plus(val)
          }
        }
      }
    }

    totalFixedSum = totalFixedSum.plus(mFixed)
    monthResults.push({
      month: m.month,
      fixed: mFixed.toFixed(2),
      variable: mVar.toFixed(2),
    })
  }

  // Average fixed cost
  const averageFixed =
    months.length > 0
      ? totalFixedSum.div(months.length).toFixed(2)
      : '0.00'

  // Folder breakdown for fixed cost accounts
  const parentGroups = new Map<
    string,
    { parentLabel: string; parentCode?: string; accounts: Breakdown[] }
  >()

  for (const coaId of fixedCoaIds) {
    const node = tree.byId.get(coaId)
    const amount = (totalByCoa.get(coaId) ?? D(0)).toFixed(2)

    const leafItem: Breakdown = {
      id: coaId,
      label: node?.name ?? `Account ${coaId}`,
      code: node?.code,
      amount,
    }

    const parentNode = node?.parentId ? tree.byId.get(node.parentId) : undefined
    const parentKey = parentNode ? parentNode.coaId : '__root__'
    const parentLabel = parentNode ? parentNode.name : 'Biaya Tetap'
    const parentCode = parentNode?.code

    const grp = parentGroups.get(parentKey) ?? {
      parentLabel,
      parentCode,
      accounts: [],
    }
    grp.accounts.push(leafItem)
    parentGroups.set(parentKey, grp)
  }

  const byFolder: Breakdown[] = []
  for (const [folderId, grp] of parentGroups.entries()) {
    let folderSum = D(0)
    for (const acc of grp.accounts) {
      folderSum = folderSum.plus(D(acc.amount))
    }

    byFolder.push({
      id: folderId,
      label: grp.parentLabel,
      code: grp.parentCode,
      amount: folderSum.toFixed(2),
      children: grp.accounts,
    })
  }

  return {
    months: monthResults,
    averageFixed,
    byFolder,
    basketEmpty: false,
  }
}
