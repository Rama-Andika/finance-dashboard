import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk } from '~/server/db/chunk'
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

async function lookupParties(
  table: 'vendor' | 'customer',
  idColumn: 'vendor_id' | 'customer_id',
  ids: Id[],
): Promise<Array<{ id: Id; code: string; name: string }>> {
  const results: Array<{ id: Id; code: string; name: string }> = []
  for (const slice of chunk(ids)) {
    const res = await rows<{ id: string; code: string | null; name: string | null }>(sql`
      SELECT t.${sql.identifier(idColumn)} AS id, t.code AS code, t.name AS name
      FROM ${sql.identifier(table)} t
      WHERE t.${sql.identifier(idColumn)} IN (${inList(slice)})
    `)
    for (const r of res) {
      results.push({ id: String(r.id), code: r.code || '', name: r.name || '' })
    }
  }
  return results
}

export async function listVendors(vendorIds: Id[]): Promise<VendorLookupRow[]> {
  const found = await lookupParties('vendor', 'vendor_id', vendorIds)
  return found.map((r) => ({ vendorId: r.id, code: r.code, name: r.name }))
}

export async function listCustomers(customerIds: Id[]): Promise<CustomerLookupRow[]> {
  const found = await lookupParties('customer', 'customer_id', customerIds)
  return found.map((r) => ({ customerId: r.id, code: r.code, name: r.name }))
}
