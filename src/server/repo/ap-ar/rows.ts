import '@tanstack/react-start/server-only'
import { D } from '~/lib/core/money'
import { toInt } from '~/server/db/convert'
import { idOrEmpty, toDay } from '~/server/repo/ap-ar/shared'
import type { AgingInvoice, AgingUnallocated } from '~/server/repo/ap-ar/types'
import type { Id, Money } from '~/lib/core/types'

/** The party column is called `vendorId` on the AP side and `customerId` on the AR side. */
export type PartyKey = 'vendorId' | 'customerId'
export type AgingInvoiceOf<K extends PartyKey> = Omit<AgingInvoice, 'partyId'> & Record<K, Id>
export type AgingUnallocatedOf<K extends PartyKey> = Omit<AgingUnallocated, 'partyId'> & Record<K, Id>

/**
 * One open invoice as the ERP query, the snapshot table and the month-end history all return it
 * (the SQL of each source aliases its columns to these names).
 */
export type AgingInvoiceDbRow = {
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
}

/** One payment or credit note without allocation, as every source returns it. */
export type AgingUnallocatedDbRow = {
  cardId: string
  partyId: string | null
  locationId: string | null
  coaId: string | null
  txDate: string
  balance: number | string
}

/** A decimal that is already a 2-decimal string (snapshot columns) is kept as it is; anything else is rounded to 2 decimals. */
const TWO_DECIMALS = /^-?\d+\.\d{2}$/
const toMoney = (v: number | string | null): Money =>
  typeof v === 'string' && TWO_DECIMALS.test(v) ? v : D(v || 0).toFixed(2)

/** The single place that turns a database row into an aging invoice. */
export function toAgingInvoice<K extends PartyKey>(r: AgingInvoiceDbRow, partyKey: K): AgingInvoiceOf<K> {
  return {
    invoiceId: String(r.invoiceId),
    invoiceNumber: r.invoiceNumber ? String(r.invoiceNumber) : '',
    [partyKey]: idOrEmpty(r.partyId),
    locationId: idOrEmpty(r.locationId),
    coaId: idOrEmpty(r.coaId),
    txDate: toDay(r.txDate),
    dueDate: r.dueDate ? toDay(r.dueDate) : null,
    itemType: toInt(r.itemType),
    originalAmount: toMoney(r.originalAmount),
    balance: toMoney(r.balance),
  } as AgingInvoiceOf<K>
}

/** The single place that turns a database row into an unallocated payment. */
export function toAgingUnallocated<K extends PartyKey>(r: AgingUnallocatedDbRow, partyKey: K): AgingUnallocatedOf<K> {
  return {
    cardId: String(r.cardId),
    [partyKey]: idOrEmpty(r.partyId),
    locationId: idOrEmpty(r.locationId),
    coaId: idOrEmpty(r.coaId),
    txDate: toDay(r.txDate),
    balance: toMoney(r.balance),
  } as AgingUnallocatedOf<K>
}
