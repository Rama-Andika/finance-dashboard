import { sum } from './money'
import { compareMoney, compareText, type Comparator } from '~/lib/table/query'
import type { AgingBucket } from './aging'
import type { Id, Money } from './types'

export type AgingSide = 'ap' | 'ar'

/** One vendor (AP) or customer (AR) row of the aging table. */
export type AgingPartyRow = {
  id: Id
  code: string
  /** Empty = party missing from the master list (data check Q7); the page shows a translated label */
  name: string
  total: Money
  /** Sum of the four overdue buckets */
  overdue: Money
  buckets: Record<AgingBucket, Money>
}

export const AGING_PARTY_SORT_KEYS = [
  'name',
  'total',
  'overdue',
  'overdue0_30',
  'overdue31_60',
  'overdue61_90',
  'overdue90plus',
] as const
export type AgingPartySortKey = (typeof AGING_PARTY_SORT_KEYS)[number]

export function overdueOf(buckets: Record<AgingBucket, Money>): Money {
  return sum([buckets.overdue0_30, buckets.overdue31_60, buckets.overdue61_90, buckets.overdue90plus])
}

export function toPartyRow(party: {
  id: Id
  code: string
  name: string
  total: Money
  buckets: Record<AgingBucket, Money>
}): AgingPartyRow {
  return { ...party, overdue: overdueOf(party.buckets) }
}

export const agingPartyComparators: Record<AgingPartySortKey, Comparator<AgingPartyRow>> = {
  name: (a, b) => compareText(a.name || '￿', b.name || '￿'), // unknown parties last
  total: (a, b) => compareMoney(a.total, b.total),
  overdue: (a, b) => compareMoney(a.overdue, b.overdue),
  overdue0_30: (a, b) => compareMoney(a.buckets.overdue0_30, b.buckets.overdue0_30),
  overdue31_60: (a, b) => compareMoney(a.buckets.overdue31_60, b.buckets.overdue31_60),
  overdue61_90: (a, b) => compareMoney(a.buckets.overdue61_90, b.buckets.overdue61_90),
  overdue90plus: (a, b) => compareMoney(a.buckets.overdue90plus, b.buckets.overdue90plus),
}
