import '@tanstack/react-start/server-only'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'
import { resolveBaskets, type ResolvedBaskets } from '~/lib/finance/coa/basket-resolver'
import { loadAccountMapping } from '~/server/services/shared/account-mapping'

/** The account baskets of the saved mapping (cash, bank, deposit, ...) resolved to account ids of the chart of accounts. */
export async function loadResolvedBaskets(tree: CoaTree): Promise<ResolvedBaskets> {
  return resolveBaskets(await loadAccountMapping(tree), tree)
}
