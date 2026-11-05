import { diffDays } from '~/lib/format/date'
import type { IsoDate } from '../../core/types'

export type AgingBucket =
  'overdue0_30' | 'overdue31_60' | 'overdue61_90' | 'overdue90plus' | 'due1_30' | 'due31_60' | 'due61_90' | 'due90plus'

export const AGING_BUCKETS: readonly AgingBucket[] = [
  'overdue0_30',
  'overdue31_60',
  'overdue61_90',
  'overdue90plus',
  'due1_30',
  'due31_60',
  'due61_90',
  'due90plus',
]

export const OVERDUE_BUCKETS: readonly AgingBucket[] = ['overdue0_30', 'overdue31_60', 'overdue61_90', 'overdue90plus']

/** A day count far beyond any real date difference: stands for "no limit" at the open end of a bucket range. */
export const DAYS_OPEN_END = 100_000_000

/**
 * Whole-day range (asOf minus due date) of every aging bucket, both ends included. The one definition behind the
 * TypeScript `bucketOf` and the SQL of the aggregate query, so the two cannot drift apart (aging-bucket-days.test.ts).
 */
export const AGING_BUCKET_DAYS: Record<AgingBucket, { min: number; max: number }> = {
  overdue0_30: { min: 0, max: 30 },
  overdue31_60: { min: 31, max: 60 },
  overdue61_90: { min: 61, max: 90 },
  overdue90plus: { min: 91, max: DAYS_OPEN_END },
  due1_30: { min: -30, max: -1 },
  due31_60: { min: -60, max: -31 },
  due61_90: { min: -90, max: -61 },
  due90plus: { min: -DAYS_OPEN_END, max: -91 },
}

/** Item type of the AR "non-trade" invoices (the value `apar.ts` compares with). */
export const NON_TRADE_ITEM_TYPE = 3

/**
 * Assigns an invoice to an aging bucket based on asOf - dueDate.
 * days = diffDays(asOf, dueDate)
 */
export function bucketOf(asOf: IsoDate, dueDate: IsoDate): AgingBucket {
  const days = diffDays(asOf, dueDate)

  if (days >= 0) {
    if (days <= 30) return 'overdue0_30'
    if (days <= 60) return 'overdue31_60'
    if (days <= 90) return 'overdue61_90'
    return 'overdue90plus'
  }

  // days < 0 (due in future)
  if (days >= -30) return 'due1_30'
  if (days >= -60) return 'due31_60'
  if (days >= -90) return 'due61_90'
  return 'due90plus'
}

export type PlanStatus = 'notSubmitted' | 'submitted' | 'approved'

/**
 * Priority: any 'Posted' or 'Partialy Paid' voucher -> approved;
 * else any 'Not Posted' -> submitted;
 * else -> notSubmitted.
 */
export function planStatus(voucherStatuses: string[]): PlanStatus {
  if (voucherStatuses.some((s) => s.toLowerCase() === 'posted' || s.toLowerCase() === 'partialy paid')) {
    return 'approved'
  }

  if (voucherStatuses.some((s) => s.toLowerCase() === 'not posted')) {
    return 'submitted'
  }

  return 'notSubmitted'
}

/** Voucher statuses that make a bill "submitted" or "approved"; any other status means "not submitted". */
export const ACTIVE_VOUCHER_STATUSES = ['Posted', 'Partialy Paid', 'Not Posted'] as const
