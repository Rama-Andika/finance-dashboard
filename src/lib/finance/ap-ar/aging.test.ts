import { describe, expect, it } from 'vitest'
import { bucketOf, planStatus } from './aging'
import { addDays } from '~/lib/format/date'

describe('aging buckets and thresholds', () => {
  const asOf = '2026-10-28'

  it('correctly maps overdue boundaries (days >= 0)', () => {
    // diff = 0 (due today) -> overdue0_30
    expect(bucketOf(asOf, asOf)).toBe('overdue0_30')

    // diff = 30 -> overdue0_30
    expect(bucketOf(asOf, addDays(asOf, -30))).toBe('overdue0_30')

    // diff = 31 -> overdue31_60
    expect(bucketOf(asOf, addDays(asOf, -31))).toBe('overdue31_60')

    // diff = 60 -> overdue31_60
    expect(bucketOf(asOf, addDays(asOf, -60))).toBe('overdue31_60')

    // diff = 61 -> overdue61_90
    expect(bucketOf(asOf, addDays(asOf, -61))).toBe('overdue61_90')

    // diff = 90 -> overdue61_90
    expect(bucketOf(asOf, addDays(asOf, -90))).toBe('overdue61_90')

    // diff = 91 -> overdue90plus
    expect(bucketOf(asOf, addDays(asOf, -91))).toBe('overdue90plus')
  })

  it('correctly maps future due boundaries (days < 0)', () => {
    // diff = -1 (due tomorrow) -> due1_30
    expect(bucketOf(asOf, addDays(asOf, 1))).toBe('due1_30')

    // diff = -30 -> due1_30
    expect(bucketOf(asOf, addDays(asOf, 30))).toBe('due1_30')

    // diff = -31 -> due31_60
    expect(bucketOf(asOf, addDays(asOf, 31))).toBe('due31_60')

    // diff = -60 -> due31_60
    expect(bucketOf(asOf, addDays(asOf, 60))).toBe('due31_60')

    // diff = -61 -> due61_90
    expect(bucketOf(asOf, addDays(asOf, 61))).toBe('due61_90')

    // diff = -90 -> due61_90
    expect(bucketOf(asOf, addDays(asOf, 90))).toBe('due61_90')

    // diff = -91 -> due90plus
    expect(bucketOf(asOf, addDays(asOf, 91))).toBe('due90plus')
  })
})

describe('plan status priority', () => {
  it('gives highest priority to approved vouchers (Posted or Partialy Paid)', () => {
    expect(planStatus(['Posted'])).toBe('approved')
    expect(planStatus(['Partialy Paid'])).toBe('approved')
    expect(planStatus(['Not Posted', 'Posted'])).toBe('approved')
    expect(planStatus(['Draft', 'Partialy Paid'])).toBe('approved')
  })

  it('gives medium priority to submitted vouchers (Not Posted)', () => {
    expect(planStatus(['Not Posted'])).toBe('submitted')
    expect(planStatus(['Draft', 'Not Posted'])).toBe('submitted')
  })

  it('defaults to notSubmitted', () => {
    expect(planStatus([])).toBe('notSubmitted')
    expect(planStatus(['Paid'])).toBe('notSubmitted')
    expect(planStatus(['Canceled'])).toBe('notSubmitted')
  })
})
