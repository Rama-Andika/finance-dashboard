import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { chunkOrAll } from '~/server/db/chunk'
import {
  AGING_SIDES,
  IN_OUT_VALUES,
  intList,
} from '~/server/db/erp-codes'
import { D } from '~/lib/core/money'
import { memo } from '~/server/cache'
import { addDays } from '~/lib/format/date'
import { apArSnapshotCovers, snapshotOpenInvoices, snapshotUnallocated } from '~/server/dash/snapshot'
import { apArHistCovers, histOpenInvoices, histUnallocated } from '~/server/dash/snapshot-hist'
import { idOrEmpty, locationFilter, toDay } from '~/server/repo/apar.shared'
import type { AgingInvoice, AgingSide, AgingUnallocated } from '~/server/repo/apar.types'
import type { Id, IsoDate, Money } from '~/lib/core/types'

const AGING_CACHE_MS = 5 * 60 * 1000

// One implementation for both sides; they differ only in module and transaction types.

function locKeyOf(locIds: Id[] | 'all'): string {
  return locIds === 'all' ? 'all' : [...locIds].sort().join(',')
}

/**
 * Open invoices with their balance at the end of the day before `asOfPlusOne`.
 * The cached array is shared by every caller: treat it as read-only. The party id is stored under
 * its final name (`vendorId` / `customerId`) once, so callers never copy the (up to ~160k) rows.
 */
async function agingInvoices<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOfPlusOne: IsoDate,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingInvoice, 'partyId'> & Record<K, Id>>> {
  if (locIds !== 'all' && locIds.length === 0) return []
  // The current state is read from the snapshot table (small, indexed); only other dates hit the ERP tables.
  if (await apArSnapshotCovers(addDays(asOfPlusOne, -1))) return snapshotOpenInvoices(side, locIds, partyKey)
  // A past month-end that the background job has already built
  if (await apArHistCovers(addDays(asOfPlusOne, -1))) return histOpenInvoices(side, addDays(asOfPlusOne, -1), locIds, partyKey)
  return liveAgingInvoices(side, asOfPlusOne, locIds, partyKey)
}

/** The ERP query behind `agingInvoices` (slow on a large ERP); exported so tests can compare it with the snapshot. */
export function liveAgingInvoices<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOfPlusOne: IsoDate,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingInvoice, 'partyId'> & Record<K, Id>>> {
  type Row = Omit<AgingInvoice, 'partyId'> & Record<K, Id>
  if (locIds !== 'all' && locIds.length === 0) return Promise.resolve([])
  const cfg = AGING_SIDES[side]

  return memo(`${side}AgingInvoices:${asOfPlusOne}:${locKeyOf(locIds)}`, AGING_CACHE_MS, async () => {
    const results: Row[] = []

    for (const lChunk of chunkOrAll(locIds)) {
      const res = await rows<{
        invoiceId: string
        invoiceNumber: string | null
        partyId: string | null
        locationId: string | null
        coaId: string | null
        txDate: string
        dueDate: string | null
        itemType: number | string
        originalAmount: number | string
        balance: number | string
      }>(sql`
        SELECT i.ap_ar_card_id AS invoiceId,
               COALESCE(NULLIF(i.invoice_number, ''), i.transaction_number, '') AS invoiceNumber,
               i.owner_id AS partyId,
               i.location_id AS locationId,
               i.coa_id AS coaId,
               DATE(i.transaction_date) AS txDate,
               i.due_date AS dueDate,
               i.transaction_type AS itemType,
               i.amount * i.in_out AS originalAmount,
               i.amount * i.in_out + COALESCE(SUM(CASE WHEN p.ap_ar_card_id IS NOT NULL THEN d.amount END), 0) AS balance
        FROM ap_ar_card i
        LEFT JOIN ap_ar_card_detail d ON d.invoice_id = i.ap_ar_card_id
        LEFT JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
                              AND p.transaction_date < ${asOfPlusOne}
                              AND p.in_out IN (${intList(IN_OUT_VALUES)})
                              AND p.module_type = ${cfg.module}
                              AND p.transaction_type IN (${intList(cfg.settlementTypes)})
        WHERE i.module_type = ${cfg.module}
          AND i.transaction_type IN (${intList(cfg.invoiceTypes)})
          AND i.in_out IN (${intList(IN_OUT_VALUES)})
          AND i.transaction_date < ${asOfPlusOne}
          ${locationFilter('i', lChunk)}
        GROUP BY i.ap_ar_card_id, i.invoice_number, i.transaction_number, i.owner_id, i.location_id, i.coa_id, DATE(i.transaction_date), i.due_date, i.transaction_type, i.amount, i.in_out
        HAVING balance <> 0
      `)

      for (const r of res) {
        results.push({
          invoiceId: String(r.invoiceId),
          invoiceNumber: r.invoiceNumber ? String(r.invoiceNumber) : '',
          [partyKey]: idOrEmpty(r.partyId),
          locationId: idOrEmpty(r.locationId),
          coaId: idOrEmpty(r.coaId),
          txDate: toDay(r.txDate),
          dueDate: r.dueDate ? toDay(r.dueDate) : null,
          itemType: Number(r.itemType) || 0,
          originalAmount: D(r.originalAmount || 0).toFixed(2),
          balance: D(r.balance || 0).toFixed(2),
        } as Row)
      }
    }

    return results
  })
}

/** Payments / credit notes with no allocation to any invoice (shared cached array: read-only). */
async function agingUnallocated<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOfPlusOne: IsoDate,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  if (locIds !== 'all' && locIds.length === 0) return []
  if (await apArSnapshotCovers(addDays(asOfPlusOne, -1))) return snapshotUnallocated(side, locIds, partyKey)
  if (await apArHistCovers(addDays(asOfPlusOne, -1))) return histUnallocated(side, addDays(asOfPlusOne, -1), locIds, partyKey)
  return liveAgingUnallocated(side, asOfPlusOne, locIds, partyKey)
}

/** The ERP query behind `agingUnallocated`; exported for the snapshot comparison test. */
export function liveAgingUnallocated<K extends 'vendorId' | 'customerId'>(
  side: AgingSide,
  asOfPlusOne: IsoDate,
  locIds: Id[] | 'all',
  partyKey: K,
): Promise<Array<Omit<AgingUnallocated, 'partyId'> & Record<K, Id>>> {
  type Row = Omit<AgingUnallocated, 'partyId'> & Record<K, Id>
  if (locIds !== 'all' && locIds.length === 0) return Promise.resolve([])
  const cfg = AGING_SIDES[side]

  return memo(`${side}AgingUnallocated:${asOfPlusOne}:${locKeyOf(locIds)}`, AGING_CACHE_MS, async () => {
    const results: Row[] = []

    for (const lChunk of chunkOrAll(locIds)) {
      const res = await rows<{
        cardId: string
        partyId: string | null
        locationId: string | null
        coaId: string | null
        txDate: string
        balance: number | string
      }>(sql`
        SELECT p.ap_ar_card_id AS cardId,
               p.owner_id AS partyId,
               p.location_id AS locationId,
               p.coa_id AS coaId,
               DATE(p.transaction_date) AS txDate,
               p.amount * p.in_out AS balance
        FROM ap_ar_card p
        WHERE p.module_type = ${cfg.module}
          AND p.transaction_type IN (${intList(cfg.unallocatedTypes)})
          AND p.in_out IN (${intList(IN_OUT_VALUES)})
          AND p.transaction_date < ${asOfPlusOne}
          ${locationFilter('p', lChunk)}
          AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id)
      `)

      for (const r of res) {
        results.push({
          cardId: String(r.cardId),
          [partyKey]: idOrEmpty(r.partyId),
          locationId: idOrEmpty(r.locationId),
          coaId: idOrEmpty(r.coaId),
          txDate: toDay(r.txDate),
          balance: D(r.balance || 0).toFixed(2),
        } as Row)
      }
    }

    return results
  })
}

export type ApOpenInvoiceRow = {
  invoiceId: Id
  invoiceNumber?: string
  vendorId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  dueDate: IsoDate | null
  itemType: number
  originalAmount: Money
  balance: Money
}

export type ApUnallocatedPaymentRow = {
  cardId: Id
  vendorId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  balance: Money
}

export type ArOpenInvoiceRow = {
  invoiceId: Id
  invoiceNumber?: string
  customerId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  dueDate: IsoDate | null
  itemType: number
  originalAmount: Money
  balance: Money
}

export type ArUnallocatedReceiptRow = {
  cardId: Id
  customerId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  balance: Money
}

/** Open invoices with a balance ("part A" in data-model §9) and payments not allocated to any invoice ("part B"). */
/** The returned arrays are cached and shared: callers must not modify them. */
export function apOpenInvoices(asOfPlusOne: IsoDate, locIds: Id[] | 'all'): Promise<ApOpenInvoiceRow[]> {
  return agingInvoices('ap', asOfPlusOne, locIds, 'vendorId')
}

export function apUnallocatedPayments(asOfPlusOne: IsoDate, locIds: Id[] | 'all'): Promise<ApUnallocatedPaymentRow[]> {
  return agingUnallocated('ap', asOfPlusOne, locIds, 'vendorId')
}

export function arOpenInvoices(asOfPlusOne: IsoDate, locIds: Id[] | 'all'): Promise<ArOpenInvoiceRow[]> {
  return agingInvoices('ar', asOfPlusOne, locIds, 'customerId')
}

export function arUnallocatedReceipts(asOfPlusOne: IsoDate, locIds: Id[] | 'all'): Promise<ArUnallocatedReceiptRow[]> {
  return agingUnallocated('ar', asOfPlusOne, locIds, 'customerId')
}

export type CardSettlementRow = {
  cardId: Id
  transactionType: number
  transactionNumber: string
  txDate: IsoDate
  amount: Money
}

export async function cardSettlementHistory(invoiceId: Id): Promise<CardSettlementRow[]> {
  const query = sql`
    SELECT p.ap_ar_card_id AS cardId,
           p.transaction_type AS transactionType,
           COALESCE(p.transaction_number, '') AS transactionNumber,
           DATE(p.transaction_date) AS txDate,
           d.amount AS amount
    FROM ap_ar_card_detail d
    JOIN ap_ar_card p ON p.ap_ar_card_id = d.ap_ar_card_id
    WHERE d.invoice_id = ${invoiceId}
    ORDER BY p.transaction_date, p.ap_ar_card_id
  `
  return rows<CardSettlementRow>(query)
}
