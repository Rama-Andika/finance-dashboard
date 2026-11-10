import { describe, expect, it } from 'vitest'
import { createJobId, createRequestId, dayOfLogId, isLogId } from './request-id'

const at = new Date(Date.UTC(2026, 10, 10, 14, 35, 51, 93))

describe('createRequestId', () => {
  it('starts with the local date and time and ends with five readable characters', () => {
    const id = createRequestId(at, 'Asia/Makassar')
    expect(id).toMatch(/^20261110-223551-[a-hjkmnp-z2-9]{5}$/)
    expect(isLogId(id)).toBe(true)
  })

  it('differs from one call to the next', () => {
    const ids = new Set(Array.from({ length: 200 }, () => createRequestId(at, 'UTC')))
    expect(ids.size).toBe(200)
  })

  it('never uses the look-alike characters i, l, o, 0 or 1 in the random part', () => {
    for (let i = 0; i < 300; i++) {
      const suffix = createRequestId(at, 'UTC').slice(-5)
      expect(suffix).not.toMatch(/[ilo01]/)
    }
  })
})

describe('createJobId', () => {
  it('is a request id with the prefix "job-"', () => {
    const id = createJobId(at, 'UTC')
    expect(id).toMatch(/^job-20261110-143551-[a-hjkmnp-z2-9]{5}$/)
    expect(isLogId(id)).toBe(true)
  })
})

describe('isLogId and dayOfLogId', () => {
  it('rejects text that is not an id', () => {
    expect(isLogId('hello')).toBe(false)
    expect(isLogId('20261110-143551-k7q2')).toBe(false)
    expect(isLogId('20261110-143551-k7q2m ')).toBe(false)
    expect(dayOfLogId('hello')).toBeNull()
  })

  it('reads the day out of an id', () => {
    expect(dayOfLogId('20261110-143551-k7q2m')).toBe('2026-11-10')
    expect(dayOfLogId('job-20261109-010203-abcde')).toBe('2026-11-09')
  })
})
