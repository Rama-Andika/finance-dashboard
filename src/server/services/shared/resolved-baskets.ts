import '@tanstack/react-start/server-only'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'
import { resolveBaskets, type AccountMapping, type ResolvedBaskets } from '~/lib/finance/coa/basket-resolver'
import { loadAccountMapping } from '~/server/services/shared/account-mapping'

/**
 * What was resolved from each mapping object. `loadAccountMapping` gives the same object for the same chart of accounts
 * and stored text, and an object belongs to one chart of accounts, so the answer is valid for as long as the object lives.
 */
const resolvedCache = new WeakMap<AccountMapping, ResolvedBaskets>()

/**
 * The account baskets of the saved mapping (cash, bank, deposit, ...) resolved to account ids of the chart of accounts.
 * The returned lists are shared by every caller: read them, never change them.
 */
export async function loadResolvedBaskets(tree: CoaTree): Promise<ResolvedBaskets> {
  const mapping = await loadAccountMapping(tree)
  let resolved = resolvedCache.get(mapping)
  if (!resolved) {
    resolved = resolveBaskets(mapping, tree)
    resolvedCache.set(mapping, resolved)
  }
  return resolved
}
