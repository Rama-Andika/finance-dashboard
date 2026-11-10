import { describe, expect, it } from 'vitest'
import { formatLogTime, logDay, resolveLogTimeZone } from './log-time'

describe('resolveLogTimeZone', () => {
  const serverZone = Intl.DateTimeFormat().resolvedOptions().timeZone

  it('uses a valid configured zone', () => {
    expect(resolveLogTimeZone('Asia/Makassar')).toBe('Asia/Makassar')
  })

  it('falls back to the zone of the server when nothing is configured', () => {
    expect(resolveLogTimeZone(undefined)).toBe(serverZone)
    expect(resolveLogTimeZone('')).toBe(serverZone)
  })

  it('falls back to the zone of the server when the name is not a zone', () => {
    expect(resolveLogTimeZone('Not/AZone')).toBe(serverZone)
  })
})

describe('formatLogTime', () => {
  const at = new Date(Date.UTC(2026, 10, 10, 14, 35, 51, 93))

  it('writes the local clock with the offset', () => {
    expect(formatLogTime(at, 'Asia/Makassar')).toBe('2026-11-10T22:35:51.093+08:00')
    expect(formatLogTime(at, 'Asia/Jakarta')).toBe('2026-11-10T21:35:51.093+07:00')
  })

  it('writes UTC as +00:00', () => {
    expect(formatLogTime(at, 'UTC')).toBe('2026-11-10T14:35:51.093+00:00')
  })

  it('writes midnight as 00, not 24', () => {
    const midnight = new Date(Date.UTC(2026, 10, 9, 17, 0, 0, 0))
    expect(formatLogTime(midnight, 'Asia/Jakarta')).toBe('2026-11-10T00:00:00.000+07:00')
  })

  it('handles a negative offset that changes with daylight saving', () => {
    expect(formatLogTime(at, 'America/New_York')).toBe('2026-11-10T09:35:51.093-05:00')
    expect(formatLogTime(new Date(Date.UTC(2026, 6, 1, 12, 0, 0, 0)), 'America/New_York')).toBe(
      '2026-07-01T08:00:00.000-04:00',
    )
  })

  it('handles a half-hour offset', () => {
    expect(formatLogTime(at, 'Asia/Kolkata')).toBe('2026-11-10T20:05:51.093+05:30')
  })
})

describe('logDay', () => {
  it('is the calendar day in the zone, not in UTC', () => {
    const lateEveningUtc = new Date(Date.UTC(2026, 10, 10, 20, 0, 0, 0))
    expect(logDay(lateEveningUtc, 'UTC')).toBe('2026-11-10')
    expect(logDay(lateEveningUtc, 'Asia/Jakarta')).toBe('2026-11-11')
  })
})
