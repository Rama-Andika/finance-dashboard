import { describe, expect, it } from 'vitest'
import { globalSearchSchema } from './search-schema'

describe('globalSearchSchema', () => {
  it('defaults empty object to standard fallback', () => {
    expect(globalSearchSchema.parse({})).toEqual({
      entity: 'all',
      preset: 'this-month',
      p13: false,
    })
  })

  it('falls back to this-month for invalid preset', () => {
    expect(globalSearchSchema.parse({ preset: 'kemarin' })).toEqual({
      entity: 'all',
      preset: 'this-month',
      p13: false,
    })
  })

  it('allows valid comma-separated entity codes', () => {
    expect(globalSearchSchema.parse({ entity: 'A01,B02' })).toEqual({
      entity: 'A01,B02',
      preset: 'this-month',
      p13: false,
    })
  })

  it('catches and sanitizes malicious entity input back to all', () => {
    expect(globalSearchSchema.parse({ entity: "x' OR 1=1" })).toEqual({
      entity: 'all',
      preset: 'this-month',
      p13: false,
    })
    expect(globalSearchSchema.parse({ entity: '<script>alert(1)</script>' })).toEqual({
      entity: 'all',
      preset: 'this-month',
      p13: false,
    })
  })

  it('parses p13 toggle correctly', () => {
    expect(globalSearchSchema.parse({ p13: true })).toEqual({
      entity: 'all',
      preset: 'this-month',
      p13: true,
    })
    expect(globalSearchSchema.parse({ p13: 'invalid' })).toEqual({
      entity: 'all',
      preset: 'this-month',
      p13: false,
    })
  })
})
