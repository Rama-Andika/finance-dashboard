import { describe, expect, it } from 'vitest'
import { resolvePeriod } from './periods'
import { mockPeriods } from 'tests/fixtures/periods.fixture'

describe('resolvePeriod', () => {
  const today = '2026-10-28'

  it('resolves this-month preset', () => {
    const res = resolvePeriod('this-month', false, today, mockPeriods)
    expect(res.d1).toBe('2026-10-01')
    expect(res.asOf).toBe('2026-10-28')
    expect(res.periodIds.length).toBe(1)
    expect(res.hasOpenPeriod).toBe(true)
    expect(res.compare.d1).toBe('2026-09-01')
    expect(res.compare.asOf).toBe('2026-09-30')
    expect(res.compare.periodIds.length).toBe(1)
  })

  it('resolves last-month preset', () => {
    const res = resolvePeriod('last-month', false, today, mockPeriods)
    expect(res.d1).toBe('2026-09-01')
    expect(res.asOf).toBe('2026-09-30')
    expect(res.periodIds.length).toBe(1)
    expect(res.compare.d1).toBe('2026-08-01')
    expect(res.compare.asOf).toBe('2026-08-31')
  })

  it('resolves this-quarter preset (Q4 up to today)', () => {
    const res = resolvePeriod('this-quarter', false, today, mockPeriods)
    expect(res.d1).toBe('2026-10-01')
    expect(res.asOf).toBe('2026-10-28')
    expect(res.months).toEqual(['2026-10'])
    expect(res.compare.d1).toBe('2026-07-01')
    expect(res.compare.asOf).toBe('2026-09-30')
    expect(res.compare.periodIds.length).toBe(3)
  })

  it('resolves ytd preset (Jan..Oct) and ignores future period 13', () => {
    const withoutP13 = resolvePeriod('ytd', false, today, mockPeriods)
    expect(withoutP13.d1).toBe('2026-01-01')
    expect(withoutP13.asOf).toBe('2026-10-28')
    expect(withoutP13.periodIds.length).toBe(10)

    // With includeP13 = true, Period 13 of 2026 ends in Dec so it is outside asOf (2026-10-28), stays 10
    const withP13 = resolvePeriod('ytd', true, today, mockPeriods)
    expect(withP13.periodIds.length).toBe(10)
  })

  it('resolves last-12m preset with and without p13', () => {
    const withoutP13 = resolvePeriod('last-12m', false, today, mockPeriods)
    expect(withoutP13.d1).toBe('2025-11-01')
    expect(withoutP13.asOf).toBe('2026-10-28')
    expect(withoutP13.periodIds.length).toBe(12)

    // With includeP13 = true, Period 13 of 2025 ends 2025-12-31 (within 2025-11-01..2026-10-28) -> 13
    const withP13 = resolvePeriod('last-12m', true, today, mockPeriods)
    expect(withP13.periodIds.length).toBe(13)
  })

  it('reports missingMonths when period rows do not exist', () => {
    const partialPeriods = mockPeriods.filter((p) => p.startDate !== '2026-05-01')
    const res = resolvePeriod('ytd', false, today, partialPeriods)
    expect(res.missingMonths).toContain('2026-05')
  })

  describe('explicit month range', () => {
    it('resolves one closed month and compares with the month before it', () => {
      const res = resolvePeriod('this-month', false, today, mockPeriods, { from: '2026-09', to: '2026-09' })
      expect(res.months).toEqual(['2026-09'])
      expect(res.d1).toBe('2026-09-01')
      expect(res.asOf).toBe('2026-09-30')
      expect(res.compare.d1).toBe('2026-08-01')
      expect(res.compare.asOf).toBe('2026-08-31')
    })

    it('resolves a multi-month range and compares with the range of the same length before it', () => {
      const res = resolvePeriod('ytd', false, today, mockPeriods, { from: '2026-07', to: '2026-09' })
      expect(res.months).toEqual(['2026-07', '2026-08', '2026-09'])
      expect(res.asOf).toBe('2026-09-30')
      expect(res.compare.d1).toBe('2026-04-01')
      expect(res.compare.asOf).toBe('2026-06-30')
      expect(res.compare.periodIds.length).toBe(3)
    })

    it('never goes past today', () => {
      const res = resolvePeriod('ytd', false, today, mockPeriods, { from: '2026-09', to: '2026-12' })
      expect(res.asOf).toBe(today)
    })

    it('crosses a year boundary for the comparison range', () => {
      const res = resolvePeriod('ytd', false, today, mockPeriods, { from: '2026-01', to: '2026-02' })
      expect(res.compare.d1).toBe('2025-11-01')
      expect(res.compare.asOf).toBe('2025-12-31')
    })

    it('ignores an inverted or incomplete range and falls back to the preset', () => {
      const inverted = resolvePeriod('last-month', false, today, mockPeriods, { from: '2026-09', to: '2026-03' })
      const partial = resolvePeriod('last-month', false, today, mockPeriods, { from: '2026-09' })
      expect(inverted.d1).toBe('2026-09-01')
      expect(inverted.months).toEqual(['2026-09'])
      expect(partial.months).toEqual(['2026-09'])
    })
  })
})
