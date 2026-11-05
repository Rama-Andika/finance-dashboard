import Decimal from 'decimal.js'
import { describe, expect, it } from 'vitest'
import { addDays, diffDays } from '~/lib/format/date'
import { D } from '../../core/money'
import type { CoaTree } from '../coa/coa-tree'
import { NON_TRADE_ITEM_TYPE, bucketOf, type AgingBucket } from './aging'
import {
  computeApAging,
  computeArAging,
  formatBuckets,
  initBuckets,
  type ApOpenInvoiceRow,
  type ApUnallocatedPaymentRow,
} from './apar'
import {
  computeApAgingFromAggregates,
  computeArAgingFromAggregates,
  mergeAgingAggregates,
  type AgingAggregates,
  type ItemAggregate,
  type PaymentAggregate,
} from './aging-aggregate'

const ASOF = '2026-06-15'

const tree = {
  byId: new Map([
    ['c1', { code: '2100', name: 'Accounts Payable' }],
    ['c2', { code: '2200', name: 'Other Payable' }],
  ]),
} as unknown as CoaTree

function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function sampleData(seed: number, itemCount: number, paymentCount: number) {
  const r = random(seed)
  const int = (n: number) => Math.floor(r() * n)
  const pick = <T>(list: readonly T[]): T => list[int(list.length)] as T
  const parties = ['', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6']
  const coas = ['c1', 'c2', '']
  const money = () => ((int(200_000) - 40_000) / 100).toFixed(2)

  const items: ApOpenInvoiceRow[] = Array.from({ length: itemCount }, (_, i) => {
    const txDate = addDays('2026-01-01', int(300))
    return {
      invoiceId: `i${i}`,
      vendorId: pick(parties),
      locationId: `l${int(3)}`,
      coaId: pick(coas),
      txDate,
      dueDate: r() < 0.2 ? null : addDays(txDate, int(120)),
      itemType: 1 + int(3),
      balance: money(),
    }
  })
  const payments: ApUnallocatedPaymentRow[] = Array.from({ length: paymentCount }, (_, i) => ({
    cardId: `p${i}`,
    vendorId: pick(parties),
    locationId: `l${int(3)}`,
    coaId: pick(coas),
    txDate: addDays('2026-01-01', int(300)),
    balance: money(),
  }))
  return { items, payments }
}

type ItemAcc = {
  buckets: Record<AgingBucket, Decimal>
  positive: Decimal
  negative: Decimal
  nonTrade: Decimal
  overdueBills: Decimal
}

/** What the SQL does, written with bucketOf: one row per party with the bucket sums and the extra sums. */
function aggregateLikeSql(items: ApOpenInvoiceRow[], payments: ApUnallocatedPaymentRow[]): AgingAggregates {
  const itemMap = new Map<string, ItemAcc>()
  for (const i of items) {
    const acc: ItemAcc = itemMap.get(i.vendorId) ?? {
      buckets: initBuckets(),
      positive: D(0),
      negative: D(0),
      nonTrade: D(0),
      overdueBills: D(0),
    }
    itemMap.set(i.vendorId, acc)
    const due = i.dueDate ?? i.txDate
    const bal = D(i.balance)
    const bucket = bucketOf(ASOF, due)
    acc.buckets[bucket] = acc.buckets[bucket].plus(bal)
    if (bal.gt(0)) acc.positive = acc.positive.plus(bal)
    if (bal.lt(0)) acc.negative = acc.negative.plus(bal)
    if (i.itemType === NON_TRADE_ITEM_TYPE) acc.nonTrade = acc.nonTrade.plus(bal)
    if (bal.gt(0) && diffDays(ASOF, due) >= 0) acc.overdueBills = acc.overdueBills.plus(bal)
  }
  const paymentMap = new Map<string, Record<AgingBucket, Decimal>>()
  for (const p of payments) {
    const acc = paymentMap.get(p.vendorId) ?? initBuckets()
    paymentMap.set(p.vendorId, acc)
    const bucket = bucketOf(ASOF, p.txDate)
    acc[bucket] = acc[bucket].plus(D(p.balance))
  }
  return {
    items: Array.from(itemMap, ([partyId, a]): ItemAggregate => ({
      partyId,
      buckets: formatBuckets(a.buckets),
      positive: a.positive.toFixed(2),
      negative: a.negative.toFixed(2),
      nonTrade: a.nonTrade.toFixed(2),
      overdueBills: a.overdueBills.toFixed(2),
    })),
    payments: Array.from(paymentMap, ([partyId, b]): PaymentAggregate => ({ partyId, buckets: formatBuckets(b) })),
    coaIds: Array.from(new Set([...items.map((i) => i.coaId), ...payments.map((p) => p.coaId)])),
  }
}

const byKey = <T>(list: T[], key: (t: T) => string): T[] => [...list].sort((a, b) => key(a).localeCompare(key(b)))
const normalizeAp = (r: ReturnType<typeof computeApAging>) => ({
  ...r,
  byVendor: byKey(r.byVendor, (v) => v.vendorId),
  controlAccounts: byKey(r.controlAccounts, (a) => a.coaId),
})
const normalizeAr = (r: ReturnType<typeof computeArAging>) => ({
  ...r,
  byCustomer: byKey(r.byCustomer, (c) => c.customerId),
  controlAccounts: byKey(r.controlAccounts, (a) => a.coaId),
})

const names = new Map([
  ['p1', { code: 'V1', name: 'Vendor 1' }],
  ['p2', { code: 'V2', name: 'Vendor 2' }],
])

describe('aging from per-party sums equals aging from every invoice', () => {
  for (const seed of [1, 2, 3, 4, 5]) {
    it(`payables, seed ${seed}`, () => {
      const { items, payments } = sampleData(seed, 400, 60)
      const old = computeApAging({
        partA: items,
        partB: payments,
        asOf: ASOF,
        vendors: names,
        tree,
      })
      const fresh = computeApAgingFromAggregates({
        aggregates: aggregateLikeSql(items, payments),
        vendors: names,
        tree,
      })
      expect(normalizeAp(fresh)).toEqual(normalizeAp(old))
    })

    it(`receivables, seed ${seed}`, () => {
      const { items, payments } = sampleData(seed + 100, 400, 60)
      const arItems = items.map(({ vendorId, ...rest }) => ({
        ...rest,
        customerId: vendorId,
      }))
      const arPayments = payments.map(({ vendorId, ...rest }) => ({
        ...rest,
        customerId: vendorId,
      }))
      const old = computeArAging({
        partA: arItems,
        partB: arPayments,
        asOf: ASOF,
        customers: names,
        tree,
      })
      const fresh = computeArAgingFromAggregates({
        aggregates: aggregateLikeSql(items, payments),
        customers: names,
        tree,
      })
      expect(normalizeAr(fresh)).toEqual(normalizeAr(old))
    })
  }

  it('is all zeros and empty for no data', () => {
    const fresh = computeApAgingFromAggregates({
      aggregates: { items: [], payments: [], coaIds: [] },
      vendors: new Map(),
      tree,
    })
    expect(fresh.total).toBe('0.00')
    expect(fresh.overdueBills).toBe('0.00')
    expect(fresh.byVendor).toEqual([])
    expect(fresh.controlAccounts).toEqual([])
  })
})

describe('mergeAgingAggregates', () => {
  it('adding the aggregates of two halves gives the aggregate of the whole', () => {
    const { items, payments } = sampleData(9, 300, 40)
    const whole = aggregateLikeSql(items, payments)
    const merged = mergeAgingAggregates([
      aggregateLikeSql(items.slice(0, 150), payments.slice(0, 20)),
      aggregateLikeSql(items.slice(150), payments.slice(20)),
    ])
    const normalize = (a: AgingAggregates) => ({
      items: byKey(a.items, (r) => r.partyId),
      payments: byKey(a.payments, (r) => r.partyId),
      coaIds: [...a.coaIds].sort(),
    })
    expect(normalize(merged)).toEqual(normalize(whole))
  })
})
