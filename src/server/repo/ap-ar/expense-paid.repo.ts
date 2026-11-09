import '@tanstack/react-start/server-only'
import { toInt } from '~/server/db/convert'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { SLICE_CONCURRENCY, chunkOrAll, mapLimit } from '~/server/db/chunk'
import { memo } from '~/server/cache'
import { EXPENSE_PAID_TYPES, IN_OUT_VALUES, MODULE_TYPE, intList } from '~/server/db/erp-codes'
import { D } from '~/lib/core/money'
import { idOrEmpty, locKeyOf, locationFilter, toDay } from '~/server/repo/ap-ar/shared'

import type { Id, IsoDate, Money } from '~/lib/core/types'

/** The Expense Paid metric and its drill-down read the same cards: they share one read for a minute. */
const EXPENSE_PAID_CACHE_MS = 60 * 1000

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

async function readAllocated(
  d1: IsoDate,
  d2PlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<ExpensePaidAllocatedRow[]> {
  if (locIds !== 'all' && locIds.length === 0) return []

  // The slices of 1,000 locations do not depend on each other: read them together.
  const slices = await mapLimit(chunkOrAll(locIds), SLICE_CONCURRENCY, async (lChunk) => {
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

    return res.map((r): ExpensePaidAllocatedRow => ({
      cardId: String(r.cardId),
      cardNumber: r.cardNumber ?? '',
      txDate: toDay(r.txDate),
      locationId: idOrEmpty(r.locationId),
      vendorId: idOrEmpty(r.vendorId),
      itemType: toInt(r.itemType),
      detailSum: D(r.detailSum || 0).toFixed(2),
    }))
  })

  return slices.flat()
}

async function readUnallocated(
  d1: IsoDate,
  d2PlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<ExpensePaidUnallocatedRow[]> {
  if (locIds !== 'all' && locIds.length === 0) return []

  // The slices of 1,000 locations do not depend on each other: read them together.
  const slices = await mapLimit(chunkOrAll(locIds), SLICE_CONCURRENCY, async (lChunk) => {
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

    return res.map((r): ExpensePaidUnallocatedRow => ({
      cardId: String(r.cardId),
      cardNumber: r.cardNumber ?? '',
      txDate: toDay(r.txDate),
      locationId: idOrEmpty(r.locationId),
      vendorId: idOrEmpty(r.vendorId),
      signedAmount: D(r.signedAmount || 0).toFixed(2),
    }))
  })

  return slices.flat()
}

/** AP payment cards with allocations. The cached array is shared: callers must only read it. */
export function expensePaidAllocated(
  d1: IsoDate,
  d2PlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<ExpensePaidAllocatedRow[]> {
  if (locIds !== 'all' && locIds.length === 0) return Promise.resolve([])
  return memo(`expensePaidAllocated:${d1}:${d2PlusOne}:${locKeyOf(locIds)}`, EXPENSE_PAID_CACHE_MS, () =>
    readAllocated(d1, d2PlusOne, locIds),
  )
}

/** AP payment cards without any allocation. The cached array is shared: callers must only read it. */
export function expensePaidUnallocated(
  d1: IsoDate,
  d2PlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<ExpensePaidUnallocatedRow[]> {
  if (locIds !== 'all' && locIds.length === 0) return Promise.resolve([])
  return memo(`expensePaidUnallocated:${d1}:${d2PlusOne}:${locKeyOf(locIds)}`, EXPENSE_PAID_CACHE_MS, () =>
    readUnallocated(d1, d2PlusOne, locIds),
  )
}
