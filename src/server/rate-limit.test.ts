import { describe, expect, it } from 'vitest'
import { createRateLimiter } from './rate-limit'

describe('createRateLimiter', () => {
  it('allows up to max hits within windowMs, blocks subsequent, resets after window', () => {
    const limiter = createRateLimiter({ max: 5, windowMs: 60_000 })
    const baseTime = 1_000_000

    // 5 hits allowed
    expect(limiter.hit('127.0.0.1|admin', baseTime)).toBe(true)
    expect(limiter.hit('127.0.0.1|admin', baseTime + 1000)).toBe(true)
    expect(limiter.hit('127.0.0.1|admin', baseTime + 2000)).toBe(true)
    expect(limiter.hit('127.0.0.1|admin', baseTime + 3000)).toBe(true)
    expect(limiter.hit('127.0.0.1|admin', baseTime + 4000)).toBe(true)

    // 6th hit within 60s blocked
    expect(limiter.hit('127.0.0.1|admin', baseTime + 5000)).toBe(false)
    expect(limiter.hit('127.0.0.1|admin', baseTime + 59_000)).toBe(false)

    // Different key is not affected
    expect(limiter.hit('127.0.0.2|admin', baseTime + 5000)).toBe(true)

    // After 60s window (relative to oldest hits), allowed again
    expect(limiter.hit('127.0.0.1|admin', baseTime + 61_000)).toBe(true)
  })
})
