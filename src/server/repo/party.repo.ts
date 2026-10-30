import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk } from '~/server/db/chunk'
import { createLruCache } from '~/server/cache'
import type { Id } from '~/lib/core/types'

export type VendorLookupRow = {
  vendorId: Id
  code: string
  name: string
}

export type CustomerLookupRow = {
  customerId: Id
  code: string
  name: string
}

type PartyName = { code: string; name: string }

/**
 * Names change rarely and every payables/receivables metric asks for the same ~1,000+ parties, so they are
 * remembered per id for a while: a metric then only queries the parties it has not seen yet.
 */
const PARTY_CACHE_MS = 10 * 60 * 1000
const PARTY_CACHE_MAX_ENTRIES = 100_000
const newPartyCache = () => createLruCache<PartyName>({ maxEntries: PARTY_CACHE_MAX_ENTRIES, ttlMs: PARTY_CACHE_MS })
const vendorCache = newPartyCache()
const customerCache = newPartyCache()

/** Forgets every remembered name (tests). */
export function clearPartyCache(): void {
  vendorCache.clear()
  customerCache.clear()
}

async function lookupParties(
  table: 'vendor' | 'customer',
  idColumn: 'vendor_id' | 'customer_id',
  ids: Id[],
  cache: ReturnType<typeof newPartyCache>,
): Promise<Array<{ id: Id; code: string; name: string }>> {
  const results: Array<{ id: Id; code: string; name: string }> = []
  const missing: Id[] = []
  for (const id of new Set(ids)) {
    const known = cache.get(id)
    if (known) results.push({ id, ...known })
    else missing.push(id)
  }

  // The slices of 1,000 ids do not depend on each other: read them together.
  const slices = await Promise.all(
    chunk(missing).map((slice) =>
      rows<{ id: string; code: string | null; name: string | null }>(sql`
        SELECT t.${sql.identifier(idColumn)} AS id, t.code AS code, t.name AS name
        FROM ${sql.identifier(table)} t
        WHERE t.${sql.identifier(idColumn)} IN (${inList(slice)})
      `),
    ),
  )
  for (const r of slices.flat()) {
    const party = { code: r.code || '', name: r.name || '' }
    cache.set(String(r.id), party)
    results.push({ id: String(r.id), ...party })
  }
  return results
}

export async function listVendors(vendorIds: Id[]): Promise<VendorLookupRow[]> {
  const found = await lookupParties('vendor', 'vendor_id', vendorIds, vendorCache)
  return found.map((r) => ({ vendorId: r.id, code: r.code, name: r.name }))
}

export async function listCustomers(customerIds: Id[]): Promise<CustomerLookupRow[]> {
  const found = await lookupParties('customer', 'customer_id', customerIds, customerCache)
  return found.map((r) => ({ customerId: r.id, code: r.code, name: r.name }))
}
