import { describe, expect, it } from 'vitest'
import { addDays, cutoffDay, logFilesInRange, parseLogFileName } from './log-file-name'

describe('parseLogFileName', () => {
  it('reads the day and the rotation number', () => {
    expect(parseLogFileName('app.2026-11-10.3.log')).toEqual({
      name: 'app.2026-11-10.3.log',
      day: '2026-11-10',
      number: 3,
    })
  })

  it('rejects other names', () => {
    for (const name of [
      'app.log',
      'app.2026-11-10.log',
      'x.2026-11-10.1.log',
      'app.2026-11-10.1.log.gz',
      'app.2026-1-10.1.log',
    ]) {
      expect(parseLogFileName(name)).toBeNull()
    }
  })
})

describe('addDays and cutoffDay', () => {
  it('moves across month and year ends', () => {
    expect(addDays('2026-11-10', 1)).toBe('2026-11-11')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
    expect(addDays('2028-03-01', -1)).toBe('2028-02-29')
  })

  it('goes back the number of retention days', () => {
    expect(cutoffDay('2026-11-10', 30)).toBe('2026-10-11')
  })
})

describe('logFilesInRange', () => {
  it('keeps the files inside the range, oldest day first and rotation numbers in order', () => {
    const names = [
      'app.2026-11-10.2.log',
      'app.2026-11-09.1.log',
      'app.2026-11-10.1.log',
      'app.2026-11-01.1.log',
      'readme.txt',
    ]
    expect(logFilesInRange(names, '2026-11-09', '2026-11-10').map((f) => f.name)).toEqual([
      'app.2026-11-09.1.log',
      'app.2026-11-10.1.log',
      'app.2026-11-10.2.log',
    ])
  })

  it('sorts rotation numbers as numbers, not as text', () => {
    const names = ['app.2026-11-10.10.log', 'app.2026-11-10.9.log']
    expect(logFilesInRange(names, '2026-11-10', '2026-11-10').map((f) => f.number)).toEqual([9, 10])
  })
})
