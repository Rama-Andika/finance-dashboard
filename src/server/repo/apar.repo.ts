import '@tanstack/react-start/server-only'
import { sql } from 'drizzle-orm'
import { rows } from '~/server/db/query'
import { inList } from '~/server/db/in-list'
import { D } from '~/lib/finance/money'
import { memo } from '~/server/cache'
import type { Id, IsoDate, Money } from '~/lib/finance/types'

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

  const locChunks: (string[] | undefined)[] = []
  if (locIds !== 'all') {
    for (let i = 0; i < locIds.length; i += 1000) {
      locChunks.push(locIds.slice(i, i + 1000))
    }
  } else {
    locChunks.push(undefined)
  }

  const results: ExpensePaidAllocatedRow[] = []

  for (const lChunk of locChunks) {
    const query = sql`
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
      WHERE p.module_type = 0
        AND p.transaction_type IN (9, 10, 14)
        AND p.in_out IN (-1, 1)
        AND p.transaction_date >= ${d1}
        AND p.transaction_date < ${d2PlusOne}
        ${lChunk ? sql`AND p.location_id IN (${inList(lChunk)})` : sql``}
      GROUP BY p.ap_ar_card_id, p.transaction_number, DATE(p.transaction_date), p.location_id, i.owner_id, i.transaction_type
    `

    const res = await rows<{
      cardId: string
      cardNumber: string
      txDate: string
      locationId: string | null
      vendorId: string | null
      itemType: number | string
      detailSum: number | string
    }>(query)

    for (const r of res) {
      results.push({
        cardId: String(r.cardId),
        cardNumber: r.cardNumber ?? '',
        txDate: String(r.txDate).slice(0, 10),
        locationId: r.locationId ? String(r.locationId) : '',
        vendorId: r.vendorId ? String(r.vendorId) : '',
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

  const locChunks: (string[] | undefined)[] = []
  if (locIds !== 'all') {
    for (let i = 0; i < locIds.length; i += 1000) {
      locChunks.push(locIds.slice(i, i + 1000))
    }
  } else {
    locChunks.push(undefined)
  }

  const results: ExpensePaidUnallocatedRow[] = []

  for (const lChunk of locChunks) {
    const query = sql`
      SELECT p.ap_ar_card_id AS cardId,
             COALESCE(p.transaction_number, '') AS cardNumber,
             DATE(p.transaction_date) AS txDate,
             p.location_id AS locationId,
             p.owner_id AS vendorId,
             p.amount * p.in_out AS signedAmount
      FROM ap_ar_card p
      LEFT JOIN ap_ar_card_detail d ON d.ap_ar_card_id = p.ap_ar_card_id
      WHERE p.module_type = 0
        AND p.transaction_type IN (9, 10, 14)
        AND p.in_out IN (-1, 1)
        AND p.transaction_date >= ${d1}
        AND p.transaction_date < ${d2PlusOne}
        ${lChunk ? sql`AND p.location_id IN (${inList(lChunk)})` : sql``}
        AND d.ap_ar_card_detail_id IS NULL
    `

    const res = await rows<{
      cardId: string
      cardNumber: string
      txDate: string
      locationId: string | null
      vendorId: string | null
      signedAmount: number | string
    }>(query)

    for (const r of res) {
      results.push({
        cardId: String(r.cardId),
        cardNumber: r.cardNumber ?? '',
        txDate: String(r.txDate).slice(0, 10),
        locationId: r.locationId ? String(r.locationId) : '',
        vendorId: r.vendorId ? String(r.vendorId) : '',
        signedAmount: D(r.signedAmount || 0).toFixed(2),
      })
    }
  }

  return results
}

// ==========================================
// 2. AP Aging Queries (Step 9.8)
// ==========================================

export type ApAgingPartARow = {
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

export type ApAgingPartBRow = {
  cardId: Id
  vendorId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  balance: Money
}

export async function apAgingPartA(
  asOfPlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<ApAgingPartARow[]> {
  if (locIds !== 'all' && locIds.length === 0) return []

  const locKey = locIds === 'all' ? 'all' : [...locIds].sort().join(',')
  return memo(`apAgingPartA:${asOfPlusOne}:${locKey}`, 5 * 60 * 1000, async () => {
    const locChunks: (string[] | undefined)[] = []
    if (locIds !== 'all') {
      for (let i = 0; i < locIds.length; i += 1000) {
        locChunks.push(locIds.slice(i, i + 1000))
      }
    } else {
      locChunks.push(undefined)
    }

    const results: ApAgingPartARow[] = []

    for (const lChunk of locChunks) {
      const query = sql`
        SELECT i.ap_ar_card_id AS invoiceId,
               COALESCE(NULLIF(i.invoice_number, ''), i.transaction_number, '') AS invoiceNumber,
               i.owner_id AS vendorId,
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
                              AND p.in_out IN (-1, 1)
                              AND p.module_type = 0
                              AND p.transaction_type IN (7, 8, 9, 10, 11, 13, 14)
        WHERE i.module_type = 0
          AND i.transaction_type IN (0, 1, 2, 3, 4, 5, 6, 12)
          AND i.in_out IN (-1, 1)
          AND i.transaction_date < ${asOfPlusOne}
          ${lChunk ? sql`AND i.location_id IN (${inList(lChunk)})` : sql``}
        GROUP BY i.ap_ar_card_id, i.invoice_number, i.transaction_number, i.owner_id, i.location_id, i.coa_id, DATE(i.transaction_date), i.due_date, i.transaction_type, i.amount, i.in_out
        HAVING balance <> 0
      `

      const res = await rows<{
        invoiceId: string
        vendorId: string | null
        locationId: string | null
        coaId: string | null
        txDate: string
        dueDate: string | null
        itemType: number | string
        originalAmount: number | string
        balance: number | string
      }>(query)

      for (const r of res) {
        results.push({
          invoiceId: String(r.invoiceId),
          vendorId: r.vendorId ? String(r.vendorId) : '',
          locationId: r.locationId ? String(r.locationId) : '',
          coaId: r.coaId ? String(r.coaId) : '',
          txDate: String(r.txDate).slice(0, 10),
          dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
          itemType: Number(r.itemType) || 0,
          originalAmount: D(r.originalAmount || 0).toFixed(2),
          balance: D(r.balance || 0).toFixed(2),
        })
      }
    }

    return results
  })
}

export async function apAgingPartB(
  asOfPlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<ApAgingPartBRow[]> {
  if (locIds !== 'all' && locIds.length === 0) return []

  const locKey = locIds === 'all' ? 'all' : [...locIds].sort().join(',')
  return memo(`apAgingPartB:${asOfPlusOne}:${locKey}`, 5 * 60 * 1000, async () => {
    const locChunks: (string[] | undefined)[] = []
    if (locIds !== 'all') {
      for (let i = 0; i < locIds.length; i += 1000) {
        locChunks.push(locIds.slice(i, i + 1000))
      }
    } else {
      locChunks.push(undefined)
    }

    const results: ApAgingPartBRow[] = []

    for (const lChunk of locChunks) {
      const query = sql`
        SELECT p.ap_ar_card_id AS cardId,
               p.owner_id AS vendorId,
               p.location_id AS locationId,
               p.coa_id AS coaId,
               DATE(p.transaction_date) AS txDate,
               p.amount * p.in_out AS balance
        FROM ap_ar_card p
        LEFT JOIN ap_ar_card_detail d ON d.ap_ar_card_id = p.ap_ar_card_id
        WHERE p.module_type = 0
          AND p.transaction_type IN (7, 8, 9, 10, 11, 13, 14)
          AND p.in_out IN (-1, 1)
          AND p.transaction_date < ${asOfPlusOne}
          ${lChunk ? sql`AND p.location_id IN (${inList(lChunk)})` : sql``}
          AND d.ap_ar_card_detail_id IS NULL
      `

      const res = await rows<{
        cardId: string
        vendorId: string | null
        locationId: string | null
        coaId: string | null
        txDate: string
        balance: number | string
      }>(query)

      for (const r of res) {
        results.push({
          cardId: String(r.cardId),
          vendorId: r.vendorId ? String(r.vendorId) : '',
          locationId: r.locationId ? String(r.locationId) : '',
          coaId: r.coaId ? String(r.coaId) : '',
          txDate: String(r.txDate).slice(0, 10),
          balance: D(r.balance || 0).toFixed(2),
        })
      }
    }

    return results
  })
}

export type VendorLookupRow = {
  vendorId: Id
  code: string
  name: string
}

export async function listVendors(vendorIds: Id[]): Promise<VendorLookupRow[]> {
  if (vendorIds.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < vendorIds.length; i += 1000) {
    chunks.push(vendorIds.slice(i, i + 1000))
  }

  const results: VendorLookupRow[] = []

  for (const chunk of chunks) {
    const query = sql`
      SELECT v.vendor_id AS vendorId, v.code AS code, v.name AS name
      FROM vendor v
      WHERE v.vendor_id IN (${inList(chunk)})
    `

    const res = await rows<{
      vendorId: string
      code: string | null
      name: string | null
    }>(query)

    for (const r of res) {
      results.push({
        vendorId: String(r.vendorId),
        code: r.code || '',
        name: r.name || '',
      })
    }
  }

  return results
}

export type PlanStatusRow = {
  invoiceId: Id
  status: string
}

export async function listPlanStatuses(invoiceIds: Id[]): Promise<PlanStatusRow[]> {
  if (invoiceIds.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < invoiceIds.length; i += 1000) {
    chunks.push(invoiceIds.slice(i, i + 1000))
  }

  const results: PlanStatusRow[] = []

  for (const chunk of chunks) {
    const query = sql`
      SELECT bd.invoice_id AS invoiceId, b.status AS status
      FROM bankpo_payment_detail bd
      JOIN bankpo_payment b ON b.bankpo_payment_id = bd.bankpo_payment_id
      WHERE b.type = 0
        AND bd.invoice_id IN (${inList(chunk)})
    `

    const res = await rows<{
      invoiceId: string
      status: string | null
    }>(query)

    for (const r of res) {
      results.push({
        invoiceId: String(r.invoiceId),
        status: r.status || '',
      })
    }
  }

  return results
}

// ==========================================
// 3. AR Aging Queries (Step 9.9)
// ==========================================

export type ArAgingPartARow = {
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

export type ArAgingPartBRow = {
  cardId: Id
  customerId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  balance: Money
}

export async function arAgingPartA(
  asOfPlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<ArAgingPartARow[]> {
  if (locIds !== 'all' && locIds.length === 0) return []

  const locKey = locIds === 'all' ? 'all' : [...locIds].sort().join(',')
  return memo(`arAgingPartA:${asOfPlusOne}:${locKey}`, 5 * 60 * 1000, async () => {
    const locChunks: (string[] | undefined)[] = []
    if (locIds !== 'all') {
      for (let i = 0; i < locIds.length; i += 1000) {
        locChunks.push(locIds.slice(i, i + 1000))
      }
    } else {
      locChunks.push(undefined)
    }

    const results: ArAgingPartARow[] = []

    for (const lChunk of locChunks) {
      const query = sql`
        SELECT i.ap_ar_card_id AS invoiceId,
               COALESCE(NULLIF(i.invoice_number, ''), i.transaction_number, '') AS invoiceNumber,
               i.owner_id AS customerId,
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
                              AND p.in_out IN (-1, 1)
                              AND p.module_type = 1
                              AND p.transaction_type IN (1, 2)
        WHERE i.module_type = 1
          AND i.transaction_type IN (0, 3, 4, 5)
          AND i.in_out IN (-1, 1)
          AND i.transaction_date < ${asOfPlusOne}
          ${lChunk ? sql`AND i.location_id IN (${inList(lChunk)})` : sql``}
        GROUP BY i.ap_ar_card_id, i.invoice_number, i.transaction_number, i.owner_id, i.location_id, i.coa_id, DATE(i.transaction_date), i.due_date, i.transaction_type, i.amount, i.in_out
        HAVING balance <> 0
      `

      const res = await rows<{
        invoiceId: string
        invoiceNumber?: string
        customerId: string | null
        locationId: string | null
        coaId: string | null
        txDate: string
        dueDate: string | null
        itemType: number | string
        originalAmount: number | string
        balance: number | string
      }>(query)

      for (const r of res) {
        results.push({
          invoiceId: String(r.invoiceId),
          invoiceNumber: r.invoiceNumber ? String(r.invoiceNumber) : '',
          customerId: r.customerId ? String(r.customerId) : '',
          locationId: r.locationId ? String(r.locationId) : '',
          coaId: r.coaId ? String(r.coaId) : '',
          txDate: String(r.txDate).slice(0, 10),
          dueDate: r.dueDate ? String(r.dueDate).slice(0, 10) : null,
          itemType: Number(r.itemType) || 0,
          originalAmount: D(r.originalAmount || 0).toFixed(2),
          balance: D(r.balance || 0).toFixed(2),
        })
      }
    }

    return results
  })
}

export async function arAgingPartB(
  asOfPlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<ArAgingPartBRow[]> {
  if (locIds !== 'all' && locIds.length === 0) return []

  const locKey = locIds === 'all' ? 'all' : [...locIds].sort().join(',')
  return memo(`arAgingPartB:${asOfPlusOne}:${locKey}`, 5 * 60 * 1000, async () => {
    const locChunks: (string[] | undefined)[] = []
    if (locIds !== 'all') {
      for (let i = 0; i < locIds.length; i += 1000) {
        locChunks.push(locIds.slice(i, i + 1000))
      }
    } else {
      locChunks.push(undefined)
    }

    const results: ArAgingPartBRow[] = []

    for (const lChunk of locChunks) {
      const query = sql`
        SELECT p.ap_ar_card_id AS cardId,
               p.owner_id AS customerId,
               p.location_id AS locationId,
               p.coa_id AS coaId,
               DATE(p.transaction_date) AS txDate,
               p.amount * p.in_out AS balance
        FROM ap_ar_card p
        LEFT JOIN ap_ar_card_detail d ON d.ap_ar_card_id = p.ap_ar_card_id
        WHERE p.module_type = 1
          AND p.transaction_type = 2
          AND p.in_out IN (-1, 1)
          AND p.transaction_date < ${asOfPlusOne}
          ${lChunk ? sql`AND p.location_id IN (${inList(lChunk)})` : sql``}
          AND d.ap_ar_card_detail_id IS NULL
      `

      const res = await rows<{
        cardId: string
        customerId: string | null
        locationId: string | null
        coaId: string | null
        txDate: string
        balance: number | string
      }>(query)

      for (const r of res) {
        results.push({
          cardId: String(r.cardId),
          customerId: r.customerId ? String(r.customerId) : '',
          locationId: r.locationId ? String(r.locationId) : '',
          coaId: r.coaId ? String(r.coaId) : '',
          txDate: String(r.txDate).slice(0, 10),
          balance: D(r.balance || 0).toFixed(2),
        })
      }
    }

    return results
  })
}

export type CustomerLookupRow = {
  customerId: Id
  code: string
  name: string
}

export async function listCustomers(customerIds: Id[]): Promise<CustomerLookupRow[]> {
  if (customerIds.length === 0) return []

  const chunks: string[][] = []
  for (let i = 0; i < customerIds.length; i += 1000) {
    chunks.push(customerIds.slice(i, i + 1000))
  }

  const results: CustomerLookupRow[] = []

  for (const chunk of chunks) {
    const query = sql`
      SELECT c.customer_id AS customerId, c.code AS code, c.name AS name
      FROM customer c
      WHERE c.customer_id IN (${inList(chunk)})
    `

    const res = await rows<{
      customerId: string
      code: string | null
      name: string | null
    }>(query)

    for (const r of res) {
      results.push({
        customerId: String(r.customerId),
        code: r.code || '',
        name: r.name || '',
      })
    }
  }

  return results
}

export async function unallocatedCustomerPayments(
  asOfPlusOne: IsoDate,
  locIds: Id[] | 'all',
): Promise<{ count: number; amount: Money }> {
  if (locIds !== 'all' && locIds.length === 0) {
    return { count: 0, amount: '0.00' }
  }

  const locChunks: (string[] | undefined)[] = []
  if (locIds !== 'all') {
    for (let i = 0; i < locIds.length; i += 1000) {
      locChunks.push(locIds.slice(i, i + 1000))
    }
  } else {
    locChunks.push(undefined)
  }

  let totalCount = 0
  let totalAmount = D(0)

  for (const lChunk of locChunks) {
    const query = sql`
      SELECT COUNT(*) AS n, COALESCE(SUM(p.amount * p.in_out), 0) AS amount
      FROM ap_ar_card p
      LEFT JOIN ap_ar_card_detail d ON d.ap_ar_card_id = p.ap_ar_card_id
      WHERE p.module_type = 1
        AND p.transaction_type = 1
        AND p.in_out IN (-1, 1)
        AND p.transaction_date < ${asOfPlusOne}
        ${lChunk ? sql`AND p.location_id IN (${inList(lChunk)})` : sql``}
        AND d.ap_ar_card_detail_id IS NULL
    `

    const res = await rows<{ n: number | string; amount: number | string }>(query)
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
