import { describe, expect, it } from 'vitest'
import {
  addDays,
  diffDays,
  formatDate,
  formatMonth,
  formatMonthYear,
  todayIn,
} from './date'

describe('date formatting and math', () => {
  it('formats full dates with localized month names', () => {
    expect(formatDate('2026-10-28', 'id')).toBe('28 Okt 2026')
    expect(formatDate('2026-10-28', 'en')).toBe('28 Oct 2026')
    expect(formatDate('2026-08-01', 'id')).toBe('1 Agu 2026')
  })

  it('formats month and month-year', () => {
    expect(formatMonth('2026-10-01', 'id')).toBe('Okt')
    expect(formatMonthYear('2026-10-01', 'id')).toBe('Okt 2026')
  })

  it('calculates calendar difference between dates accurately', () => {
    expect(diffDays('2026-10-28', '2026-09-28')).toBe(30)
    expect(diffDays('2026-03-01', '2026-02-28')).toBe(1)
  })

  it('adds calendar days across month and year boundaries in UTC', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
  })

  it('computes today date in given timezone', () => {
    expect(todayIn('Asia/Jakarta', new Date('2026-10-27T18:30:00Z'))).toBe('2026-10-28')
  })
})
