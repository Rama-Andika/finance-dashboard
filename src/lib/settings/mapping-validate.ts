import type { AccountMapping } from '~/lib/finance/basket-resolver'
import { resolveBaskets } from '~/lib/finance/basket-resolver'
import type { CoaTree } from '~/lib/finance/coa-tree'
import type { BasketKey, Id } from '~/lib/finance/types'

export type MappingIssue =
  | { kind: 'conflict'; coaId: Id; baskets: BasketKey[] } // same account in >1 of cash/bank/deposit/inTransit -> BLOCKS saving
  | { kind: 'cashBankEmpty' } // warning: Cash Position = 0
  | { kind: 'missing'; coaId: Id } // warning: "deleted account", ignored in calculations

export function validateMapping(
  mapping: AccountMapping,
  tree: CoaTree,
): { blocking: MappingIssue[]; warnings: MappingIssue[] } {
  const resolved = resolveBaskets(mapping, tree)
  const blocking: MappingIssue[] = []
  const warnings: MappingIssue[] = []

  // Check conflicts among liquid baskets (cash, bank, deposit, inTransit) - fixedCost excluded!
  const liquidBaskets: BasketKey[] = ['cash', 'bank', 'deposit', 'inTransit']
  const accountBasketMap = new Map<Id, BasketKey[]>()

  for (const bKey of liquidBaskets) {
    const ids = resolved[bKey]
    for (const id of ids) {
      const list = accountBasketMap.get(id)
      if (list) {
        list.push(bKey)
      } else {
        accountBasketMap.set(id, [bKey])
      }
    }
  }

  for (const [id, baskets] of accountBasketMap.entries()) {
    if (baskets.length > 1) {
      blocking.push({ kind: 'conflict', coaId: id, baskets })
    }
  }

  // Warning: if cash and bank are both empty -> cashBankEmpty
  if (resolved.cash.length === 0 && resolved.bank.length === 0) {
    warnings.push({ kind: 'cashBankEmpty' })
  }

  // Warning: missing accounts
  for (const id of resolved.missing) {
    warnings.push({ kind: 'missing', coaId: id })
  }

  return { blocking, warnings }
}
