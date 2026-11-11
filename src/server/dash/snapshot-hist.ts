import '@tanstack/react-start/server-only'
import {
  toAgingInvoice,
  toAgingUnallocated,
  type AgingInvoiceDbRow,
  type AgingUnallocatedDbRow,
} from '~/server/repo/ap-ar/rows'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { AGING_SIDES, type AgingSide } from '~/server/db/erp-codes'
import { memo } from '~/server/cache'
import { readSnapshotIndex } from './built-index'
import type { Id, IsoDate } from '~/lib/core/types'
import type { AgingInvoice, AgingUnallocated } from '~/server/repo/ap-ar/types'
import { byLocation } from './snapshot'
import { DASH_TABLES } from './tables'

const DATES_TTL_MS = 15_000
/** Month-end data never changes between rebuilds; the key carries the build time, and the memo is bounded anyway. */
const HIST_MEMO_TTL_MS = 30 * 60 * 1000

/**
 * Month-ends present in the history tables (day -> when it was built, ISO UTC).
 * Empty when the tables do not exist yet (migration not applied); any other read error is logged and also answers empty (not remembered). The returned Map is shared: never change it.
 */
export function apArHistDates(): Promise<Map<IsoDate, string>> {
  return readSnapshotIndex('dash:ap-ar:hist:dates', DATES_TTL_MS, 'ap/ar history dates', async () => {
    const res = await rows<{ asOfDate: string; builtAt: string }>(sql`
      SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS asOfDate,
             DATE_FORMAT(built_at, '%Y-%m-%dT%H:%i:%sZ') AS builtAt
      FROM ${sql.identifier(DASH_TABLES.apArHistDates)}
    `)
    return new Map<IsoDate, string>(res.map((r) => [String(r.asOfDate), String(r.builtAt)] as const))
  })
}

/** True when `asOf` is a month-end that the history holds completely. */
export async function apArHistCovers(asOf: IsoDate): Promise<boolean> {
  return (await apArHistDates()).has(asOf)
}

async function readHistOpen<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOf: IsoDate,
  partyKey: K,
): Promise<Array<Omit<AgingInvoice, 'partyId'> & Record<K, Id>>> {
  const res = await rows<AgingInvoiceDbRow>(sql`
    SELECT card_id AS invoiceId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
           tx_date AS txDate, due_date AS dueDate, item_type AS itemType,
           invoice_number AS invoiceNumber, original_amount AS originalAmount, balance AS balance
    FROM ${sql.identifier(DASH_TABLES.apArHistOpen)}
    WHERE as_of_date = ${asOf} AND module_type = ${AGING_SIDES[side].module}
  `)
  return res.map((r) => toAgingInvoice(r, partyKey))
}

async function readHistUnallocated<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOf: IsoDate,
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  const res = await rows<AgingUnallocatedDbRow>(sql`
    SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
           tx_date AS txDate, balance AS balance
    FROM ${sql.identifier(DASH_TABLES.apArHistUnallocated)}
    WHERE as_of_date = ${asOf} AND module_type = ${AGING_SIDES[side].module} AND kind = 'counted'
  `)
  return res.map((r) => toAgingUnallocated(r, partyKey))
}

/** Open invoices of one side at the end of the month `asOf` (call `apArHistCovers(asOf)` first). */
export async function histOpenInvoices<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOf: IsoDate,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingInvoice, 'partyId'> & Record<K, Id>>> {
  if (locIds !== 'all' && locIds.length === 0) return []
  const builtAt = (await apArHistDates()).get(asOf)
  if (!builtAt) throw new Error(`No AP/AR history for ${asOf}`)
  const all = await memo(`dash:ap-ar:hist:open:${side}:${partyKey}:${asOf}:${builtAt}`, HIST_MEMO_TTL_MS, () =>
    readHistOpen(side, asOf, partyKey),
  )
  return byLocation(all, locIds)
}

/** Unallocated payments / credit notes of one side at the end of the month `asOf` (call `apArHistCovers(asOf)` first). */
export async function histUnallocated<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOf: IsoDate,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  if (locIds !== 'all' && locIds.length === 0) return []
  const builtAt = (await apArHistDates()).get(asOf)
  if (!builtAt) throw new Error(`No AP/AR history for ${asOf}`)
  const all = await memo(`dash:ap-ar:hist:unalloc:${side}:${partyKey}:${asOf}:${builtAt}`, HIST_MEMO_TTL_MS, () =>
    readHistUnallocated(side, asOf, partyKey),
  )
  return byLocation(all, locIds)
}
