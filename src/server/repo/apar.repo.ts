import '@tanstack/react-start/server-only'
import { sql, type SQL } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { chunk, chunkOrAll } from '~/server/db/chunk'
import {
  AGING_SIDES,
  AR_UNALLOCATED_RECEIPT_TYPE,
  EXPENSE_PAID_TYPES,
  IN_OUT_VALUES,
  MODULE_TYPE,
  intList,
} from '~/server/db/erp-codes'
import { D } from '~/lib/finance/money'
import { ACTIVE_VOUCHER_STATUSES } from '~/lib/finance/aging'
import { memo } from '~/server/cache'
import { addDays } from '~/lib/format/date'
import { apArSnapshotCovers, snapshotOpenInvoices, snapshotUnallocated } from '~/server/dash/snapshot'
import type { Id, IsoDate, Money } from '~/lib/finance/types'

const AGING_CACHE_MS = 5 * 60 * 1000

const toDay = (v: unknown): IsoDate => String(v).slice(0, 10)
const idOrEmpty = (v: unknown): Id => (v ? String(v) : '')

/** `AND <alias>.location_id IN (...)` for one location slice, or nothing when the slice is "all". */
function locationFilter(alias: 'i' | 'p', slice: string[] | undefined): SQL {
  return slice ? sql`AND ${sql.identifier(alias)}.location_id IN (${inList(slice)})` : sql``
}

// ==========================================
// 1. Expense Paid Queries (Step 9.7)
// ==========================================

export type ExpensePaidAllocatedRow = {
  cardId: Id
  cardNumber: string
  txDate: IsoDate
  locationId: Id
  vendorId: Id
  itemType: number
  detailSum: Money
}

export type ExpensePaidUnallocatedRow = {
  cardId: Id
  cardNumber: string
  txDate: IsoDate
  locationId: Id
  vendorId: Id
  signedAmount: Money
}

export async function expensePaidAllocated(
  d1: IsoDate,
  d2PlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<ExpensePaidAllocatedRow[]> {
  if (locIds !== 'all' && locIds.length === 0) return []

  const results: ExpensePaidAllocatedRow[] = []

  for (const lChunk of chunkOrAll(locIds)) {
    const res = await rows<{
      cardId: string
      cardNumber: string
      txDate: string
      locationId: string | null
      vendorId: string | null
      itemType: number | string
      detailSum: number | string
    }>(sql`
      SELECT p.ap_ar_card_id AS cardId,
             COALESCE(p.transaction_number, '') AS cardNumber,
             DATE(p.transaction_date) AS txDate,
             p.location_id AS locationId,
             i.owner_id AS vendorId,
             i.transaction_type AS itemType,
             SUM(d.amount) AS detailSum
      FROM ap_ar_card p
      JOIN ap_ar_card_detail d ON d.ap_ar_card_id = p.ap_ar_card_id
      JOIN ap_ar_card i        ON i.ap_ar_card_id = d.invoice_id
      WHERE p.module_type = ${MODULE_TYPE.AP}
        AND p.transaction_type IN (${intList(EXPENSE_PAID_TYPES)})
        AND p.in_out IN (${intList(IN_OUT_VALUES)})
        AND p.transaction_date >= ${d1}
        AND p.transaction_date < ${d2PlusOne}
        ${locationFilter('p', lChunk)}
      GROUP BY p.ap_ar_card_id, p.transaction_number, DATE(p.transaction_date), p.location_id, i.owner_id, i.transaction_type
    `)

    for (const r of res) {
      results.push({
        cardId: String(r.cardId),
        cardNumber: r.cardNumber ?? '',
        txDate: toDay(r.txDate),
        locationId: idOrEmpty(r.locationId),
        vendorId: idOrEmpty(r.vendorId),
        itemType: Number(r.itemType) || 0,
        detailSum: D(r.detailSum || 0).toFixed(2),
      })
    }
  }

  return results
}

export async function expensePaidUnallocated(
  d1: IsoDate,
  d2PlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<ExpensePaidUnallocatedRow[]> {
  if (locIds !== 'all' && locIds.length === 0) return []

  const results: ExpensePaidUnallocatedRow[] = []

  for (const lChunk of chunkOrAll(locIds)) {
    const res = await rows<{
      cardId: string
      cardNumber: string
      txDate: string
      locationId: string | null
      vendorId: string | null
      signedAmount: number | string
    }>(sql`
      SELECT p.ap_ar_card_id AS cardId,
             COALESCE(p.transaction_number, '') AS cardNumber,
             DATE(p.transaction_date) AS txDate,
             p.location_id AS locationId,
             p.owner_id AS vendorId,
             p.amount * p.in_out AS signedAmount
      FROM ap_ar_card p
      WHERE p.module_type = ${MODULE_TYPE.AP}
        AND p.transaction_type IN (${intList(EXPENSE_PAID_TYPES)})
        AND p.in_out IN (${intList(IN_OUT_VALUES)})
        AND p.transaction_date >= ${d1}
        AND p.transaction_date < ${d2PlusOne}
        ${locationFilter('p', lChunk)}
        AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id)
    `)

    for (const r of res) {
      results.push({
        cardId: String(r.cardId),
        cardNumber: r.cardNumber ?? '',
        txDate: toDay(r.txDate),
        locationId: idOrEmpty(r.locationId),
        vendorId: idOrEmpty(r.vendorId),
        signedAmount: D(r.signedAmount || 0).toFixed(2),
      })
    }
  }

  return results
}

// ==========================================
// 2. AP / AR Aging Queries (Step 9.8 / 9.9)
//    One implementation for both sides; they differ only in module and transaction types.
// ==========================================

type AgingSide = 'ap' | 'ar'

export type AgingInvoice = {
  invoiceId: Id
  invoiceNumber: string
  partyId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  dueDate: IsoDate | null
  itemType: number
  originalAmount: Money
  balance: Money
}

export type AgingUnallocated = {
  cardId: Id
  partyId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  balance: Money
}

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
  type Row = Omit<AgingInvoice, 'partyId'> & Record<K, Id>
  if (locIds !== 'all' && locIds.length === 0) return []
  // The current state is read from the snapshot table (small, indexed); only other dates hit the ERP tables.
  if (await apArSnapshotCovers(addDays(asOfPlusOne, -1))) return snapshotOpenInvoices(side, locIds, partyKey)
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
  type Row = Omit<AgingUnallocated, 'partyId'> & Record<K, Id>
  if (locIds !== 'all' && locIds.length === 0) return []
  if (await apArSnapshotCovers(addDays(asOfPlusOne, -1))) return snapshotUnallocated(side, locIds, partyKey)
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

// ==========================================
// 3. Party lookups
// ==========================================

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

export type PlanStatusRow = {
  invoiceId: Id
  status: string
}

/** Payment vouchers (type 0) of the given invoices; for the one page of bills a drill-down shows. */
export async function listPlanStatuses(invoiceIds: Id[]): Promise<PlanStatusRow[]> {
  const parts = await Promise.all(
    chunk(invoiceIds).map((slice) =>
      rows<{ invoiceId: string; status: string | null }>(sql`
        SELECT bd.invoice_id AS invoiceId, b.status AS status
        FROM bankpo_payment_detail bd
        JOIN bankpo_payment b ON b.bankpo_payment_id = bd.bankpo_payment_id
        WHERE b.type = 0
          AND bd.invoice_id IN (${inList(slice)})
      `),
    ),
  )
  return parts.flat().map((r) => ({ invoiceId: String(r.invoiceId), status: r.status || '' }))
}

/**
 * Every invoice that has a live payment voucher (Posted / Partialy Paid / Not Posted), in ONE query.
 * An invoice without a live voucher is "not submitted", so the payment plan never asks per invoice.
 */
export function listActivePlanStatuses(): Promise<PlanStatusRow[]> {
  return memo('activePlanStatuses', AGING_CACHE_MS, async () => {
    const res = await rows<{ invoiceId: string; status: string | null }>(sql`
      SELECT bd.invoice_id AS invoiceId, b.status AS status
      FROM bankpo_payment_detail bd
      JOIN bankpo_payment b ON b.bankpo_payment_id = bd.bankpo_payment_id
      WHERE b.type = 0
        AND b.status IN (${inList([...ACTIVE_VOUCHER_STATUSES])})
    `)
    return res.map((r) => ({ invoiceId: String(r.invoiceId), status: r.status || '' }))
  })
}

export async function unallocatedCustomerPayments(
  asOfPlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<{ count: number; amount: Money }> {
  if (locIds !== 'all' && locIds.length === 0) {
    return { count: 0, amount: '0.00' }
  }

  let totalCount = 0
  let totalAmount = D(0)

  for (const lChunk of chunkOrAll(locIds)) {
    const res = await rows<{ n: number | string; amount: number | string }>(sql`
      SELECT COUNT(*) AS n, COALESCE(SUM(p.amount * p.in_out), 0) AS amount
      FROM ap_ar_card p
      WHERE p.module_type = ${MODULE_TYPE.AR}
        AND p.transaction_type = ${AR_UNALLOCATED_RECEIPT_TYPE}
        AND p.in_out IN (${intList(IN_OUT_VALUES)})
        AND p.transaction_date < ${asOfPlusOne}
        ${locationFilter('p', lChunk)}
        AND NOT EXISTS (SELECT 1 FROM ap_ar_card_detail d WHERE d.ap_ar_card_id = p.ap_ar_card_id)
    `)
    for (const r of res) {
      totalCount += Number(r.n) || 0
      totalAmount = totalAmount.plus(D(r.amount || 0))
    }
  }

  return {
    count: totalCount,
    amount: totalAmount.toFixed(2),
  }
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
