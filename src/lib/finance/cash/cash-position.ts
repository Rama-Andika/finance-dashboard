import { D, sum } from '../../core/money'
import { diffDays } from '~/lib/format/date'
import type { Breakdown, Id, IsoDate, Money } from '../../core/types'
import type { CoaTree } from '../coa/coa-tree'

export type InTransitDetailItem = {
  coaId: Id
  code: string
  name: string
  amount: Money
  count: number
  oldestAgeDays: number
  overThreeDays: boolean
}

export type CashPositionReconciliation = {
  glInTransit: Money
  registerUnsettled: Money
  diff: Money
  inSync: boolean
}

export type UnsettledItem = {
  coaId: Id
  segmentDetailId: Id
  txDate: IsoDate
  n: number
  amount: Money
}

export function computeCashTotals(
  cashBalances: Money[],
  bankBalances: Money[],
  depositBalances: Money[],
  inTransitBalances: Money[],
): {
  cash: Money
  bank: Money
  cashPosition: Money
  deposit: Money
  inTransit: Money
} {
  const cash = sum(cashBalances)
  const bank = sum(bankBalances)
  const deposit = sum(depositBalances)
  const inTransit = sum(inTransitBalances)
  const cashPosition = D(cash).plus(D(bank)).toFixed(2)

  return {
    cash,
    bank,
    cashPosition,
    deposit,
    inTransit,
  }
}

export function reconcileInTransit(
  glInTransit: Money,
  registerUnsettled: Money,
): CashPositionReconciliation {
  const diff = D(glInTransit).minus(D(registerUnsettled)).toFixed(2)
  const inSync = D(diff).abs().lt(1)

  return {
    glInTransit,
    registerUnsettled,
    diff,
    inSync,
  }
}

export function computeInTransitDetail(input: {
  inTransitCoaIds: Id[]
  tree: CoaTree
  unsettled: UnsettledItem[]
  today: IsoDate
}): InTransitDetailItem[] {
  const { inTransitCoaIds, tree, unsettled, today } = input
  const byCoa = new Map<Id, UnsettledItem[]>()

  for (const item of unsettled) {
    const list = byCoa.get(item.coaId) ?? []
    list.push(item)
    byCoa.set(item.coaId, list)
  }

  return inTransitCoaIds.map((coaId) => {
    const node = tree.byId.get(coaId)
    const code = node?.code ?? ''
    const name = node?.name ?? '(Unknown)'
    const rows = byCoa.get(coaId) ?? []

    if (rows.length === 0) {
      return {
        coaId,
        code,
        name,
        amount: '0.00',
        count: 0,
        oldestAgeDays: 0,
        overThreeDays: false,
      }
    }

    let totalAmount = D(0)
    let totalCount = 0
    let oldestAge = 0

    for (const r of rows) {
      totalAmount = totalAmount.plus(D(r.amount))
      totalCount += r.n
      const age = diffDays(today, r.txDate)
      if (age > oldestAge) {
        oldestAge = age
      }
    }

    return {
      coaId,
      code,
      name,
      amount: totalAmount.toFixed(2),
      count: totalCount,
      oldestAgeDays: oldestAge,
      overThreeDays: oldestAge > 3,
    }
  })
}

export function buildCashPositionBreakdown(
  tree: CoaTree,
  cashIds: Id[],
  bankIds: Id[],
  balances: Map<Id, Money>,
): Breakdown[] {
  function buildCategory(label: string, categoryId: string, ids: Id[]): Breakdown {
    // Group accounts by their immediate parent node in the tree
    const parentGroups = new Map<string, { parentLabel: string; parentCode?: string; accounts: Breakdown[] }>()

    for (const coaId of ids) {
      const node = tree.byId.get(coaId)
      const amount = balances.get(coaId) ?? '0.00'
      const leafItem: Breakdown = {
        id: coaId,
        label: node?.name ?? `Account ${coaId}`,
        code: node?.code,
        amount,
      }

      const parentNode = node?.parentId ? tree.byId.get(node.parentId) : undefined
      const parentKey = parentNode ? parentNode.coaId : '__root__'
      const parentLabel = parentNode ? parentNode.name : label
      const parentCode = parentNode?.code

      const grp = parentGroups.get(parentKey) ?? {
        parentLabel,
        parentCode,
        accounts: [],
      }
      grp.accounts.push(leafItem)
      parentGroups.set(parentKey, grp)
    }

    const folderBreakdowns: Breakdown[] = []
    let categorySum = D(0)

    for (const [folderId, grp] of parentGroups.entries()) {
      let folderSum = D(0)
      for (const acc of grp.accounts) {
        folderSum = folderSum.plus(D(acc.amount))
      }
      categorySum = categorySum.plus(folderSum)

      folderBreakdowns.push({
        id: folderId,
        label: grp.parentLabel,
        code: grp.parentCode,
        amount: folderSum.toFixed(2),
        children: grp.accounts,
      })
    }

    return {
      id: categoryId,
      label,
      amount: categorySum.toFixed(2),
      children: folderBreakdowns,
    }
  }

  const cashCategory = buildCategory('Cash', 'cash', cashIds)
  const bankCategory = buildCategory('Bank', 'bank', bankIds)

  return [cashCategory, bankCategory]
}
