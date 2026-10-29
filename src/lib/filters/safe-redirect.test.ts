import { describe, expect, it } from 'vitest'
import { isSafeRedirect, safeRedirectSchema } from './safe-redirect'

describe('safe redirect', () => {
  it('accepts internal paths with their query string', () => {
    expect(isSafeRedirect('/profit-loss')).toBe(true)
    expect(isSafeRedirect('/profit-loss?preset=ytd&entity=all')).toBe(true)
  })

  it('rejects external, protocol-relative and malformed targets', () => {
    for (const bad of ['//example.com', 'https://example.com', '/\\example.com', 'profit-loss', '/login?redirect=/x', '/a\nb']) {
      expect(isSafeRedirect(bad)).toBe(false)
    }
  })

  it('falls back to the summary for anything unsafe or missing', () => {
    expect(safeRedirectSchema.parse('//example.com')).toBe('/summary')
    expect(safeRedirectSchema.parse(undefined)).toBe('/summary')
    expect(safeRedirectSchema.parse('/budget?preset=ytd')).toBe('/budget?preset=ytd')
  })
})
