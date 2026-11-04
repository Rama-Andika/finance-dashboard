import '@tanstack/react-start/server-only'
import type { Id } from '~/lib/core/types'
import { getCachedCoaTree } from '~/server/context'
import { loadResolvedBaskets } from '~/server/services/shared/resolved-baskets'
import { allCashAccountIds } from '~/server/services/cash/cash-flow.service'

/**
 * The cash accounts as Settings define them right now (cash, bank and deposit baskets). The same list every metric
 * passes to `linesOfCashJournals`, so the snapshot built for it matches what the readers ask for.
 */
export async function currentCashAccountIds(): Promise<Id[]> {
  const tree = await getCachedCoaTree()
  return allCashAccountIds(await loadResolvedBaskets(tree))
}
