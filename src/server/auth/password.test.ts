import { describe, expect, it } from 'vitest'
import { safeEqual } from './password'

describe('safeEqual', () => {
  it('returns true for matching strings', () => {
    expect(safeEqual('abc', 'abc')).toBe(true)
    expect(safeEqual('secretPassword123', 'secretPassword123')).toBe(true)
    expect(safeEqual('', '')).toBe(true)
  })

  it('returns false for different strings', () => {
    expect(safeEqual('abc', 'abd')).toBe(false)
    expect(safeEqual('a', 'abc')).toBe(false)
    expect(safeEqual('abc', '')).toBe(false)
  })
})
