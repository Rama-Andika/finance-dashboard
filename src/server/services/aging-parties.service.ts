import '@tanstack/react-start/server-only'
import type { AppContextFilter } from '~/server/context'
import { computeApAging } from '~/server/services/ap-aging.service'
import { computeArAging } from '~/server/services/ar-aging.service'
import {
  agingPartyComparators,
  toPartyRow,
  type AgingPartyRow,
  type AgingSide,
} from '~/lib/finance/aging-parties'
import { paginate, type Page, type TableQuery } from '~/lib/table/query'

/** Upper bound for a CSV export of the whole table */
const EXPORT_LIMIT = 100_000

/** Every vendor / customer of the aging result. The aging itself is memoized, so paging never re-queries the DB. */
async function loadParties(side: AgingSide, filter: AppContextFilter): Promise<AgingPartyRow[]> {
  if (side === 'ap') {
    const result = await computeApAging(filter)
    return result.byVendor.map((v) => toPartyRow({ ...v, id: v.vendorId }))
  }
  const result = await computeArAging(filter)
  return result.byCustomer.map((c) => toPartyRow({ ...c, id: c.customerId }))
}

/** One sorted page of the vendor / customer table (sorting happens on the whole result, not on the page). */
export async function listAgingParties(
  side: AgingSide,
  filter: AppContextFilter,
  query: TableQuery,
): Promise<Page<AgingPartyRow>> {
  return paginate(await loadParties(side, filter), query, agingPartyComparators)
}

/** All rows, in the requested order, for the CSV export. */
export async function exportAgingParties(
  side: AgingSide,
  filter: AppContextFilter,
  query: Pick<TableQuery, 'sortBy' | 'sortDir'>,
): Promise<AgingPartyRow[]> {
  const all = await loadParties(side, filter)
  return paginate(all, { ...query, page: 1, pageSize: Math.min(Math.max(all.length, 1), EXPORT_LIMIT) }, agingPartyComparators).rows
}
