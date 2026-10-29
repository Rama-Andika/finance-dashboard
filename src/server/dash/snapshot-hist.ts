import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { AGING_SIDES, type AgingSide } from '~/server/db/erp-codes'
import { memo } from '~/server/cache'
import type { Id, IsoDate } from '~/lib/finance/types'
import type { AgingInvoice, AgingUnallocated } from '~/server/repo/apar.types'
import { byLocation } from './snapshot'
import { DASH_TABLES } from './tables'

const DATES_TTL_MS = 15_000
/** Month-end data never changes between rebuilds; the key carries the build time, and the memo is bounded anyway. */
const HIST_MEMO_TTL_MS = 30 * 60 * 1000

/**
 * Month-ends present in the history tables (day -> when it was built, ISO UTC).
 * Empty when the tables do not exist yet (migration not applied). The returned Map is shared: never change it.
 */
export async function apArHistDates(): Promise<Map<IsoDate, string>> {
  return memo('dash:ap-ar:hist:dates', DATES_TTL_MS, async () => {
    try {
      const res = await rows<{ asOfDate: string; builtAt: string }>(sql`
        SELECT DATE_FORMAT(as_of_date, '%Y-%m-%d') AS asOfDate,
               DATE_FORMAT(built_at, '%Y-%m-%dT%H:%i:%sZ') AS builtAt
        FROM ${sql.identifier(DASH_TABLES.apArHistDates)}
      `)
      return new Map<IsoDate, string>(res.map((r) => [String(r.asOfDate), String(r.builtAt)] as const))
    } catch {
      return new Map<IsoDate, string>()
    }
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
  type Row = Omit<AgingInvoice, 'partyId'> & Record<K, Id>
  const res = await rows<{
    cardId: string
    partyId: string | null
    locationId: string | null
    coaId: string | null
    txDate: string
    dueDate: string | null
    itemType: number | string
    invoiceNumber: string | null
    originalAmount: string
    balance: string
  }>(sql`
    SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
           tx_date AS txDate, due_date AS dueDate, item_type AS itemType,
           invoice_number AS invoiceNumber, original_amount AS originalAmount, balance AS balance
    FROM ${sql.identifier(DASH_TABLES.apArHistOpen)}
    WHERE as_of_date = ${asOf} AND module_type = ${AGING_SIDES[side].module}
  `)
  return res.map(
    (r) =>
      ({
        invoiceId: String(r.cardId),
        invoiceNumber: r.invoiceNumber ?? '',
        [partyKey]: r.partyId ? String(r.partyId) : '',
        locationId: r.locationId ? String(r.locationId) : '',
        coaId: r.coaId ? String(r.coaId) : '',
        txDate: String(r.txDate).slice(0, 10),
        dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
        itemType: Number(r.itemType) || 0,
        // DECIMAL(22,2) columns already come back as 2-decimal strings
        originalAmount: r.originalAmount,
        balance: r.balance,
      }) as Row,
  )
}

async function readHistUnallocated<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOf: IsoDate,
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  type Row = Omit<AgingUnallocated, 'partyId'> & Record<K, Id>
  const res = await rows<{
    cardId: string
    partyId: string | null
    locationId: string | null
    coaId: string | null
    txDate: string
    balance: string
  }>(sql`
    SELECT card_id AS cardId, party_id AS partyId, location_id AS locationId, coa_id AS coaId,
           tx_date AS txDate, balance AS balance
    FROM ${sql.identifier(DASH_TABLES.apArHistUnallocated)}
    WHERE as_of_date = ${asOf} AND module_type = ${AGING_SIDES[side].module}
  `)
  return res.map(
    (r) =>
      ({
        cardId: String(r.cardId),
        [partyKey]: r.partyId ? String(r.partyId) : '',
        locationId: r.locationId ? String(r.locationId) : '',
        coaId: r.coaId ? String(r.coaId) : '',
        txDate: String(r.txDate).slice(0, 10),
        balance: r.balance,
      }) as Row,
  )
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
