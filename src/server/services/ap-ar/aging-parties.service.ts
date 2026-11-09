import '@tanstack/react-start/server-only'
import type { AppContextFilter } from '~/server/context'
import { computeApAgingParties } from '~/server/services/ap-ar/ap-aging.service'
import { computeArAgingParties } from '~/server/services/ap-ar/ar-aging.service'
import {
  agingPartyComparators,
  toPartyRow,
  type AgingPartyRow,
  type AgingPartySortKey,
  type AgingSide,
} from '~/lib/finance/ap-ar/aging-parties'
import { createViewCache, pageOfSorted, sortRows, type Page, type TableQuery } from '~/lib/table/query'

// The aging core lives as long as the snapshot and its party list is the same array until then, so the table rows and
// each sorted copy are built once per list (the list is the key) instead of on every page request.
const partyRows = createViewCache<unknown, readonly AgingPartyRow[]>()
const sortedRows = createViewCache<AgingPartyRow>()

/** Every vendor / customer of the aging core. It lives as long as the snapshot, so paging never re-queries the DB or the GL. */
async function loadParties(side: AgingSide, filter: AppContextFilter): Promise<readonly AgingPartyRow[]> {
  if (side === 'ap') {
    const vendors = await computeApAgingParties(filter)
    return partyRows(vendors, 'rows', () => vendors.map((v) => toPartyRow({ ...v, id: v.vendorId })))
  }
  const customers = await computeArAgingParties(filter)
  return partyRows(customers, 'rows', () => customers.map((c) => toPartyRow({ ...c, id: c.customerId })))
}

/** One sorted page of the vendor / customer table (sorting happens on the whole result, not on the page). */
export async function listAgingParties(
  side: AgingSide,
  filter: AppContextFilter,
  query: TableQuery,
): Promise<Page<AgingPartyRow>> {
  const rows = await loadParties(side, filter)
  const compare = query.sortBy ? agingPartyComparators[query.sortBy as AgingPartySortKey] : undefined
  const sorted = compare
    ? sortedRows(rows, `${query.sortBy}|${query.sortDir}`, () => sortRows(rows, compare, query.sortDir))
    : rows
  return pageOfSorted(sorted, query)
}
