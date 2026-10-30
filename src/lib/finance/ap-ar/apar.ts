import Decimal from 'decimal.js'
import { D } from '../../core/money'
import {
  type AgingBucket,
  AGING_BUCKETS,
  OVERDUE_BUCKETS,
  bucketOf,
} from './aging'
import type { Id, IsoDate, Money } from '../../core/types'
import type { CoaTree } from '../coa/coa-tree'

// Row shapes produced by src/server/repo/aging.repo.ts. Declared here so pure logic never imports server code.
type AgingItemBase = {
  invoiceId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  dueDate: IsoDate | null
  itemType: number
  balance: Money
}
type AgingPaymentBase = {
  cardId: Id
  locationId: Id
  coaId: Id
  txDate: IsoDate
  balance: Money
}
export type ApOpenInvoiceRow = AgingItemBase & { vendorId: Id }
export type ApUnallocatedPaymentRow = AgingPaymentBase & { vendorId: Id }
export type ArOpenInvoiceRow = AgingItemBase & { customerId: Id }
export type ArUnallocatedReceiptRow = AgingPaymentBase & { customerId: Id }

export type VendorAgingSummary = {
  vendorId: Id
  code: string
  name: string
  total: Money
  buckets: Record<AgingBucket, Money>
}

export type CustomerAgingSummary = {
  customerId: Id
  code: string
  name: string
  total: Money
  buckets: Record<AgingBucket, Money>
}

export function initBuckets(): Record<AgingBucket, Decimal> {
  return {
    overdue0_30: D(0),
    overdue31_60: D(0),
    overdue61_90: D(0),
    overdue90plus: D(0),
    due1_30: D(0),
    due31_60: D(0),
    due61_90: D(0),
    due90plus: D(0),
  }
}

export function formatBuckets(
  buckets: Record<AgingBucket, Decimal>,
): Record<AgingBucket, Money> {
  const result: Partial<Record<AgingBucket, Money>> = {}
  for (const b of AGING_BUCKETS) {
    result[b] = (buckets[b] ?? D(0)).toFixed(2)
  }
  return result as Record<AgingBucket, Money>
}

type PartyAccum = { total: Decimal; buckets: Record<AgingBucket, Decimal> }

type ControlAccount = { coaId: Id; code: string; name: string }

/** Shared AP/AR aging math: open items + unallocated payments, bucketed overall and per party. */
function accumulateAging(input: {
  items: Array<AgingItemBase & { partyId: Id }>
  payments: Array<AgingPaymentBase & { partyId: Id }>
  asOf: IsoDate
  tree: CoaTree
}): {
  unpaid: Decimal
  credits: Decimal
  unallocated: Decimal
  /** Sum of items with the AR "non-trade" transaction type (3). */
  nonTrade: Decimal
  total: Decimal
  overdueSubtotal: Decimal
  /** Sum of POSITIVE open items that are past due: bills only, without vendor credits and unallocated payments. */
  overdueBills: Decimal
  buckets: Record<AgingBucket, Decimal>
  parties: Map<Id, PartyAccum>
  controlAccounts: ControlAccount[]
} {
  const { items, payments, asOf, tree } = input

  let unpaid = D(0)
  let credits = D(0)
  let unallocated = D(0)
  let nonTrade = D(0)
  let overdueBills = D(0)
  const buckets = initBuckets()
  const parties = new Map<Id, PartyAccum>()
  const controlCoaIds = new Set<Id>()

  const addToParty = (partyId: Id, bucket: AgingBucket, bal: Decimal) => {
    let acc = parties.get(partyId)
    if (!acc) {
      acc = { total: D(0), buckets: initBuckets() }
      parties.set(partyId, acc)
    }
    acc.total = acc.total.plus(bal)
    acc.buckets[bucket] = acc.buckets[bucket].plus(bal)
  }

  for (const a of items) {
    const bal = D(a.balance)
    if (a.coaId) controlCoaIds.add(a.coaId)

    if (bal.gt(0)) unpaid = unpaid.plus(bal)
    else credits = credits.plus(bal)

    if (a.itemType === 3) nonTrade = nonTrade.plus(bal)

    // Bucket calculation: use dueDate or txDate if dueDate is null
    const bucket = bucketOf(asOf, a.dueDate || a.txDate)
    buckets[bucket] = buckets[bucket].plus(bal)
    if (bal.gt(0) && OVERDUE_BUCKETS.includes(bucket)) overdueBills = overdueBills.plus(bal)
    addToParty(a.partyId, bucket, bal)
  }

  // Unallocated payments are aged by their own transaction date
  for (const b of payments) {
    const bal = D(b.balance)
    if (b.coaId) controlCoaIds.add(b.coaId)

    unallocated = unallocated.plus(bal)
    const bucket = bucketOf(asOf, b.txDate)
    buckets[bucket] = buckets[bucket].plus(bal)
    addToParty(b.partyId, bucket, bal)
  }

  let overdueSubtotal = D(0)
  for (const b of OVERDUE_BUCKETS) overdueSubtotal = overdueSubtotal.plus(buckets[b])

  const controlAccounts = Array.from(controlCoaIds).map((coaId) => {
    const node = tree.byId.get(coaId)
    return { coaId, code: node?.code || '', name: node?.name || `Account ${coaId}` }
  })

  return {
    unpaid,
    credits,
    unallocated,
    nonTrade,
    total: unpaid.plus(credits).plus(unallocated),
    overdueSubtotal,
    overdueBills,
    buckets,
    parties,
    controlAccounts,
  }
}

export function computeApAging(input: {
  partA: ApOpenInvoiceRow[]
  partB: ApUnallocatedPaymentRow[]
  asOf: IsoDate
  vendors: Map<Id, { code: string; name: string }>
  tree: CoaTree
}): {
  total: Money
  unpaidBills: Money
  vendorCredits: Money
  unallocatedPayments: Money
  buckets: Record<AgingBucket, Money>
  overdueSubtotal: Money
  overdueBills: Money
  byVendor: VendorAgingSummary[]
  controlAccounts: ControlAccount[]
} {
  const r = accumulateAging({
    items: input.partA.map((a) => ({ ...a, partyId: a.vendorId })),
    payments: input.partB.map((b) => ({ ...b, partyId: b.vendorId })),
    asOf: input.asOf,
    tree: input.tree,
  })

  return {
    total: r.total.toFixed(2),
    unpaidBills: r.unpaid.toFixed(2),
    vendorCredits: r.credits.toFixed(2),
    unallocatedPayments: r.unallocated.toFixed(2),
    buckets: formatBuckets(r.buckets),
    overdueSubtotal: r.overdueSubtotal.toFixed(2),
    overdueBills: r.overdueBills.toFixed(2),
    byVendor: Array.from(r.parties.entries()).map(([vendorId, acc]) => {
      const v = input.vendors.get(vendorId)
      return {
        vendorId,
        code: v?.code || '',
        name: v?.name || '', // empty = unknown vendor (Q7); the page shows a translated label
        total: acc.total.toFixed(2),
        buckets: formatBuckets(acc.buckets),
      }
    }),
    controlAccounts: r.controlAccounts,
  }
}

export function computeArAging(input: {
  partA: ArOpenInvoiceRow[]
  partB: ArUnallocatedReceiptRow[]
  asOf: IsoDate
  customers: Map<Id, { code: string; name: string }>
  tree: CoaTree
}): {
  total: Money
  unpaidInvoices: Money
  customerCredits: Money
  unallocatedReturns: Money
  nonTrade: Money
  buckets: Record<AgingBucket, Money>
  overdueSubtotal: Money
  byCustomer: CustomerAgingSummary[]
  controlAccounts: ControlAccount[]
} {
  const r = accumulateAging({
    items: input.partA.map((a) => ({ ...a, partyId: a.customerId })),
    payments: input.partB.map((b) => ({ ...b, partyId: b.customerId })),
    asOf: input.asOf,
    tree: input.tree,
  })

  return {
    total: r.total.toFixed(2),
    unpaidInvoices: r.unpaid.toFixed(2),
    customerCredits: r.credits.toFixed(2),
    unallocatedReturns: r.unallocated.toFixed(2),
    nonTrade: r.nonTrade.toFixed(2),
    buckets: formatBuckets(r.buckets),
    overdueSubtotal: r.overdueSubtotal.toFixed(2),
    byCustomer: Array.from(r.parties.entries()).map(([customerId, acc]) => {
      const c = input.customers.get(customerId)
      return {
        customerId,
        code: c?.code || '',
        name: c?.name || '', // empty = unknown customer (Q7)
        total: acc.total.toFixed(2),
        buckets: formatBuckets(acc.buckets),
      }
    }),
    controlAccounts: r.controlAccounts,
  }
}
