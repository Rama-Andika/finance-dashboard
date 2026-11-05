import '@tanstack/react-start/server-only'
import { addDays } from '~/lib/format/date'
import type { Id, IsoDate, Money } from '~/lib/core/types'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'
import type { AgingAggregates } from '~/lib/finance/ap-ar/aging-aggregate'
import { type AppContextFilter, getCachedCoaTree } from '~/server/context'
import { memoBySnapshot } from '~/server/dash/snapshot'
import { agingCompareIsAvailable, distinctIds } from '~/server/services/ap-ar/aging-helpers'

export type PartyNames = Map<Id, { code: string; name: string }>

/**
 * The figures summed per party by the database instead of computed from every invoice. The two halves belong together,
 * so they are one object: a source has both or neither.
 */
export type AgingAggregateSource<Computed> = {
  /** The per-party sums for `asOf`; null when the snapshot and the month-end history cannot answer for that date. */
  load: (asOf: IsoDate, locationIds: Id[] | 'all') => Promise<AgingAggregates | null>
  compute: (input: { aggregates: AgingAggregates; names: PartyNames; tree: CoaTree }) => Computed
}

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
  /** Optional shortcut: no list of invoices is loaded when the database can sum for that date; the list is the fallback. */
  aggregate?: AgingAggregateSource<Computed>
}

/**
 * Reads of one aging side (payables or receivables), shared by `ap-aging` and `ar-aging`:
 * `core` is the heavy, snapshot-derived part; `compareTotal` is the total at the comparison date.
 */
export function createAgingReader<Open, Unallocated, Computed extends { total: Money }>(
  source: AgingSource<Open, Unallocated, Computed>,
) {
  /**
   * The figures at `asOf`: summed by the database when it can, from the list of invoices otherwise.
   * `knownNames` is given when the caller already has the party names (the comparison reuses those of the main figures).
   */
  async function figures(
    asOf: IsoDate,
    locationIds: Id[] | 'all',
    tree: CoaTree,
    knownNames?: PartyNames,
  ): Promise<{ computed: Computed; names: PartyNames }> {
    const aggregates = source.aggregate ? await source.aggregate.load(asOf, locationIds) : null
    if (source.aggregate && aggregates) {
      const names =
        knownNames ??
        (await source.loadPartyNames(
          distinctIds(
            aggregates.items.map((row) => row.partyId),
            aggregates.payments.map((row) => row.partyId),
          ),
        ))
      return { computed: source.aggregate.compute({ aggregates, names, tree }), names }
    }

    const asOfPlusOne = addDays(asOf, 1)
    const [open, unallocated] = await Promise.all([
      source.openItems(asOfPlusOne, locationIds),
      source.unallocatedItems(asOfPlusOne, locationIds),
    ])
    const names =
      knownNames ??
      (await source.loadPartyNames(
        distinctIds(open.map(source.openPartyId), unallocated.map(source.unallocatedPartyId)),
      ))
    return { computed: source.compute({ open, unallocated, asOf, names, tree }), names }
  }

  /**
   * All open items of the selected entities, the party names and the aging buckets.
   * Cached for as long as the snapshot it was built from; it needs no GL read, so the party table can use it alone.
   */
  function core(filter: AppContextFilter) {
    return memoBySnapshot(source.cacheName, { loc: filter.locationIds, asOf: filter.asOf }, async () => {
      const tree = await getCachedCoaTree()
      const { computed, names } = await figures(filter.asOf, filter.locationIds, tree)
      return { computed, names, tree }
    })
  }

  /** The total at the comparison date; null when there is no comparison or it cannot be answered quickly. */
  async function compareTotal(filter: AppContextFilter, names: PartyNames, tree: CoaTree): Promise<Money | null> {
    if (!filter.compare || !filter.compare.asOf) return null
    if (!(await agingCompareIsAvailable(filter.compare.asOf))) return null
    return (await figures(filter.compare.asOf, filter.locationIds, tree, names)).computed.total
  }

  return { core, compareTotal }
}
