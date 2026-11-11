import { describe, expect, it } from 'vitest'
import { CLIENT_ERROR_LIMITS, clientErrorSchema } from './report-schema'

const valid = { origin: 'render', name: 'TypeError', message: 'x is undefined', route: '/summary' }

describe('clientErrorSchema', () => {
  it('accepts a small report and the optional fields', () => {
    expect(clientErrorSchema.safeParse(valid).success).toBe(true)
    expect(
      clientErrorSchema.safeParse({ ...valid, stack: 'at a', componentStack: 'at B', userAgent: 'Chrome/131' }).success,
    ).toBe(true)
  })

  it('rejects an unknown origin and a missing field', () => {
    expect(clientErrorSchema.safeParse({ ...valid, origin: 'other' }).success).toBe(false)
    expect(clientErrorSchema.safeParse({ origin: 'render', name: 'x', message: 'y' }).success).toBe(false)
  })

  it('rejects a text above its limit and accepts one at the limit', () => {
    expect(clientErrorSchema.safeParse({ ...valid, message: 'x'.repeat(CLIENT_ERROR_LIMITS.message) }).success).toBe(
      true,
    )
    expect(
      clientErrorSchema.safeParse({ ...valid, message: 'x'.repeat(CLIENT_ERROR_LIMITS.message + 1) }).success,
    ).toBe(false)
    expect(clientErrorSchema.safeParse({ ...valid, stack: 'x'.repeat(CLIENT_ERROR_LIMITS.stack + 1) }).success).toBe(
      false,
    )
  })
})
