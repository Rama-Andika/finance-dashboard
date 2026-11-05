import { describe, expect, it } from 'vitest'
import { addDays } from '~/lib/format/date'
import { AGING_BUCKETS, AGING_BUCKET_DAYS, bucketOf } from './aging'

describe('AGING_BUCKET_DAYS', () => {
  const inRanges = (days: number) =>
    AGING_BUCKETS.filter((b) => days >= AGING_BUCKET_DAYS[b].min && days <= AGING_BUCKET_DAYS[b].max)

  it('puts every whole-day difference in exactly the bucket bucketOf gives', () => {
    const due = '2026-03-15'
    for (let days = -400; days <= 400; days += 1) {
      expect(inRanges(days)).toEqual([bucketOf(addDays(due, days), due)])
    }
  })

  it('has no gap and no overlap far out at both open ends', () => {
    for (const days of [-3_000_000, -100_000, 100_000, 3_000_000]) {
      expect(inRanges(days)).toHaveLength(1)
    }
  })
})
