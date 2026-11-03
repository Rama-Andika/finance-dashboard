import { describe, expect, it } from 'vitest'
import {
  addDays,
  diffDays,
  formatDate,
  formatDateTime,
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

  it('formats a moment with the month name of the language, padded day and time', () => {
    // built from local parts, so the result does not depend on the time zone of the machine running the test
    const octoberMorning = new Date(2026, 9, 3, 8, 5).toISOString()
    const mayEvening = new Date(2026, 4, 21, 23, 8).toISOString()
    expect(formatDateTime(octoberMorning, 'en')).toBe('03 Oct 2026, 08:05')
    expect(formatDateTime(octoberMorning, 'id')).toBe('03 Okt 2026, 08:05')
    expect(formatDateTime(mayEvening, 'en')).toBe('21 May 2026, 23:08')
    expect(formatDateTime(mayEvening, 'id')).toBe('21 Mei 2026, 23:08')
  })

  it('formats a text that is not a date as an empty string', () => {
    expect(formatDateTime('not a date', 'en')).toBe('')
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
