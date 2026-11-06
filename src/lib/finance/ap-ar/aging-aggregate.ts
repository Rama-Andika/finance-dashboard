import Decimal from 'decimal.js'
import { D } from '../../core/money'
import type { Id, Money } from '../../core/types'
import type { CoaTree } from '../coa/coa-tree'
import { AGING_BUCKETS, OVERDUE_BUCKETS, type AgingBucket } from './aging'
import { formatBuckets, initBuckets, type computeApAging, type computeArAging } from './apar'

/**
 * The aging figures already summed per party (by the database), instead of one row per invoice.
 * Built by src/server/dash/snapshot-aggregate.ts; turned into the same results as `computeApAging` / `computeArAging`.
 */
export type BucketAmounts = Record<AgingBucket, Money>

/** Open invoices of one party: the amount in each bucket and the sums the AP/AR figures need. */
export type ItemAggregate = {
  partyId: Id
  buckets: BucketAmounts
  /** Sum of the balances above zero */
  positive: Money
  /** Sum of the balances below zero (credits) */
  negative: Money
  /** Sum of the balances of non-trade items (AR) */
  nonTrade: Money
  /** Sum of the balances above zero that are past due */
  overdueBills: Money
  /** Sum of the balances below zero of return items (AP direct returns still open) */
  directReturns: Money
  /** How many return items have a balance below zero */
  directReturnCount: number
}

/** Payments without allocation of one party, aged by their own date. count = number of cards. */
export type PaymentAggregate = { partyId: Id; buckets: BucketAmounts; count: number }

export type AgingAggregates = {
  items: ItemAggregate[]
  payments: PaymentAggregate[]
  /** Distinct control accounts of the items and payments, as stored (empty text means none) */
  coaIds: Id[]
}

export function emptyAggregates(): AgingAggregates {
  return { items: [], payments: [], coaIds: [] }
}

function addBuckets(into: Record<AgingBucket, Decimal>, from: BucketAmounts): void {
  for (const b of AGING_BUCKETS) into[b] = into[b].plus(D(from[b]))
}

/** Adds aggregates of the same side together (slices of a long location list): the same party sums across slices. */
export function mergeAgingAggregates(parts: readonly AgingAggregates[]): AgingAggregates {
  type ItemAcc = {
    buckets: Record<AgingBucket, Decimal>
    positive: Decimal
    negative: Decimal
    nonTrade: Decimal
    overdueBills: Decimal
    directReturns: Decimal
    directReturnCount: number
  }
  const items = new Map<Id, ItemAcc>()
  const payments = new Map<Id, { buckets: Record<AgingBucket, Decimal>; count: number }>()
  const coaIds = new Set<Id>()

  for (const part of parts) {
    for (const row of part.items) {
      let acc = items.get(row.partyId)
      if (!acc) {
        acc = {
          buckets: initBuckets(),
          positive: D(0),
          negative: D(0),
          nonTrade: D(0),
          overdueBills: D(0),
          directReturns: D(0),
          directReturnCount: 0,
        }
        items.set(row.partyId, acc)
      }
      addBuckets(acc.buckets, row.buckets)
      acc.positive = acc.positive.plus(D(row.positive))
      acc.negative = acc.negative.plus(D(row.negative))
      acc.nonTrade = acc.nonTrade.plus(D(row.nonTrade))
      acc.overdueBills = acc.overdueBills.plus(D(row.overdueBills))
      acc.directReturns = acc.directReturns.plus(D(row.directReturns))
      acc.directReturnCount += row.directReturnCount
    }
    for (const row of part.payments) {
      let acc = payments.get(row.partyId)
      if (!acc) {
        acc = { buckets: initBuckets(), count: 0 }
        payments.set(row.partyId, acc)
      }
      addBuckets(acc.buckets, row.buckets)
      acc.count += row.count
    }
    for (const id of part.coaIds) coaIds.add(id)
  }

  return {
    items: Array.from(items, ([partyId, a]) => ({
      partyId,
      buckets: formatBuckets(a.buckets),
      positive: a.positive.toFixed(2),
      negative: a.negative.toFixed(2),
      nonTrade: a.nonTrade.toFixed(2),
      overdueBills: a.overdueBills.toFixed(2),
      directReturns: a.directReturns.toFixed(2),
      directReturnCount: a.directReturnCount,
    })),
    payments: Array.from(payments, ([partyId, b]) => ({
      partyId,
      buckets: formatBuckets(b.buckets),
      count: b.count,
    })),
    coaIds: Array.from(coaIds),
  }
}

type PartyAccum = { total: Decimal; buckets: Record<AgingBucket, Decimal> }

/** The same totals as `accumulateAging` in apar.ts, from per-party sums instead of one row per invoice. */
function accumulateAggregates(aggregates: AgingAggregates, tree: CoaTree) {
  let unpaid = D(0)
  let credits = D(0)
  let unallocated = D(0)
  let nonTrade = D(0)
  let overdueBills = D(0)
  let itemReturns = D(0)
  let itemReturnCount = 0
  let unallocatedCount = 0
  const buckets = initBuckets()
  const parties = new Map<Id, PartyAccum>()

  const partyOf = (partyId: Id): PartyAccum => {
    let acc = parties.get(partyId)
    if (!acc) {
      acc = { total: D(0), buckets: initBuckets() }
      parties.set(partyId, acc)
    }
    return acc
  }

  for (const row of aggregates.items) {
    unpaid = unpaid.plus(D(row.positive))
    credits = credits.plus(D(row.negative))
    nonTrade = nonTrade.plus(D(row.nonTrade))
    overdueBills = overdueBills.plus(D(row.overdueBills))
    itemReturns = itemReturns.plus(D(row.directReturns))
    itemReturnCount += row.directReturnCount
    const party = partyOf(row.partyId)
    for (const b of AGING_BUCKETS) {
      const amount = D(row.buckets[b])
      buckets[b] = buckets[b].plus(amount)
      party.buckets[b] = party.buckets[b].plus(amount)
      party.total = party.total.plus(amount)
    }
  }

  for (const row of aggregates.payments) {
    unallocatedCount += row.count
    const party = partyOf(row.partyId)
    for (const b of AGING_BUCKETS) {
      const amount = D(row.buckets[b])
      unallocated = unallocated.plus(amount)
      buckets[b] = buckets[b].plus(amount)
      party.buckets[b] = party.buckets[b].plus(amount)
      party.total = party.total.plus(amount)
    }
  }

  let overdueSubtotal = D(0)
  for (const b of OVERDUE_BUCKETS) overdueSubtotal = overdueSubtotal.plus(buckets[b])

  const controlAccounts = Array.from(new Set(aggregates.coaIds.filter(Boolean))).map((coaId) => {
    const node = tree.byId.get(coaId)
    return { coaId, code: node?.code || '', name: node?.name || `Account ${coaId}` }
  })

  return {
    unpaid,
    credits,
    unallocated,
    nonTrade,
    itemReturns,
    itemReturnCount,
    unallocatedCount,
    total: unpaid.plus(credits).plus(unallocated),
    overdueSubtotal,
    overdueBills,
    buckets,
    parties,
    controlAccounts,
  }
}

/** Same result as `computeApAging` (apar.ts) for the same invoices, from per-vendor sums. */
export function computeApAgingFromAggregates(input: {
  aggregates: AgingAggregates
  vendors: Map<Id, { code: string; name: string }>
  tree: CoaTree
}): ReturnType<typeof computeApAging> {
  const r = accumulateAggregates(input.aggregates, input.tree)
  return {
    total: r.total.toFixed(2),
    unpaidBills: r.unpaid.toFixed(2),
    vendorCredits: r.credits.toFixed(2),
    unallocatedPayments: r.unallocated.toFixed(2),
    directReturns: r.itemReturns.toFixed(2),
    directReturnCount: r.itemReturnCount,
    buckets: formatBuckets(r.buckets),
    overdueSubtotal: r.overdueSubtotal.toFixed(2),
    overdueBills: r.overdueBills.toFixed(2),
    byVendor: Array.from(r.parties.entries()).map(([vendorId, acc]) => {
      const v = input.vendors.get(vendorId)
      return {
        vendorId,
        code: v?.code || '',
        name: v?.name || '',
        total: acc.total.toFixed(2),
        buckets: formatBuckets(acc.buckets),
      }
    }),
    controlAccounts: r.controlAccounts,
  }
}

/** Same result as `computeArAging` (apar.ts) for the same invoices, from per-customer sums. */
export function computeArAgingFromAggregates(input: {
  aggregates: AgingAggregates
  customers: Map<Id, { code: string; name: string }>
  tree: CoaTree
}): ReturnType<typeof computeArAging> {
  const r = accumulateAggregates(input.aggregates, input.tree)
  return {
    total: r.total.toFixed(2),
    unpaidInvoices: r.unpaid.toFixed(2),
    customerCredits: r.credits.toFixed(2),
    directReturns: r.unallocated.toFixed(2),
    directReturnCount: r.unallocatedCount,
    nonTrade: r.nonTrade.toFixed(2),
    buckets: formatBuckets(r.buckets),
    overdueSubtotal: r.overdueSubtotal.toFixed(2),
    byCustomer: Array.from(r.parties.entries()).map(([customerId, acc]) => {
      const c = input.customers.get(customerId)
      return {
        customerId,
        code: c?.code || '',
        name: c?.name || '',
        total: acc.total.toFixed(2),
        buckets: formatBuckets(acc.buckets),
      }
    }),
    controlAccounts: r.controlAccounts,
  }
}
