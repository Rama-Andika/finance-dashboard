import '@tanstack/react-start/server-only'
import { addDays } from '~/lib/format/date'
import type { Id, IsoDate, Money } from '~/lib/core/types'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'
import { type AppContextFilter, getCachedCoaTree } from '~/server/context'
import { memoBySnapshot } from '~/server/dash/snapshot'
import { agingCompareIsAvailable, distinctIds } from '~/server/services/shared/aging.helper'

export type PartyNames = Map<Id, { code: string; name: string }>

/** What differs between payables and receivables; loading the items and the comparison are the same. */
export type AgingSource<Open, Unallocated, Computed extends { total: Money }> = {
  /** Cache name of the loaded part. */
  cacheName: string
  openItems: (asOfPlusOne: IsoDate, locationIds: Id[] | 'all') => Promise<Open[]>
  unallocatedItems: (asOfPlusOne: IsoDate, locationIds: Id[] | 'all') => Promise<Unallocated[]>
  openPartyId: (item: Open) => Id
  unallocatedPartyId: (item: Unallocated) => Id
  loadPartyNames: (ids: Id[]) => Promise<PartyNames>
  compute: (input: {
    open: Open[]
    unallocated: Unallocated[]
    asOf: IsoDate
    names: PartyNames
    tree: CoaTree
  }) => Computed
}

/**
 * Reads of one aging side (payables or receivables), shared by `ap-aging` and `ar-aging`:
 * `core` is the heavy, snapshot-derived part; `compareTotal` is the total at the comparison date.
 */
export function createAgingReader<Open, Unallocated, Computed extends { total: Money }>(
  source: AgingSource<Open, Unallocated, Computed>,
) {
  /**
   * All open items of the selected entities, the party names and the aging buckets.
   * Cached for as long as the snapshot it was built from; it needs no GL read, so the party table can use it alone.
   */
  function core(filter: AppContextFilter) {
    return memoBySnapshot(source.cacheName, { loc: filter.locationIds, asOf: filter.asOf }, async () => {
      const tree = await getCachedCoaTree()
      const asOfPlusOne = addDays(filter.asOf, 1)

      const [open, unallocated] = await Promise.all([
        source.openItems(asOfPlusOne, filter.locationIds),
        source.unallocatedItems(asOfPlusOne, filter.locationIds),
      ])

      const names = await source.loadPartyNames(
        distinctIds(open.map(source.openPartyId), unallocated.map(source.unallocatedPartyId)),
      )
      const computed = source.compute({ open, unallocated, asOf: filter.asOf, names, tree })
      return { computed, names, tree }
    })
  }

  /** The total at the comparison date; null when there is no comparison or it cannot be answered quickly. */
  async function compareTotal(filter: AppContextFilter, names: PartyNames, tree: CoaTree): Promise<Money | null> {
    if (!filter.compare || !filter.compare.asOf) return null
    if (!(await agingCompareIsAvailable(filter.compare.asOf))) return null
    const asOfPlusOne = addDays(filter.compare.asOf, 1)
    const [open, unallocated] = await Promise.all([
      source.openItems(asOfPlusOne, filter.locationIds),
      source.unallocatedItems(asOfPlusOne, filter.locationIds),
    ])
    return source.compute({ open, unallocated, asOf: filter.compare.asOf, names, tree }).total
  }

  return { core, compareTotal }
}
