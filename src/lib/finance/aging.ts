import { diffDays } from '~/lib/format/date'
import type { IsoDate } from './types'

export type AgingBucket =
  | 'overdue0_30'
  | 'overdue31_60'
  | 'overdue61_90'
  | 'overdue90plus'
  | 'due1_30'
  | 'due31_60'
  | 'due61_90'
  | 'due90plus'

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

export const OVERDUE_BUCKETS: readonly AgingBucket[] = [
  'overdue0_30',
  'overdue31_60',
  'overdue61_90',
  'overdue90plus',
]

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
  if (
    voucherStatuses.some(
      (s) => s.toLowerCase() === 'posted' || s.toLowerCase() === 'partialy paid',
    )
  ) {
    return 'approved'
  }

  if (voucherStatuses.some((s) => s.toLowerCase() === 'not posted')) {
    return 'submitted'
  }

  return 'notSubmitted'
}

/** Voucher statuses that make a bill "submitted" or "approved"; any other status means "not submitted". */
export const ACTIVE_VOUCHER_STATUSES = ['Posted', 'Partialy Paid', 'Not Posted'] as const
