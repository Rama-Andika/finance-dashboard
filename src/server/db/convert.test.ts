import { describe, expect, it } from 'vitest'
import { toInt } from './convert'

describe('toInt', () => {
  it('reads numbers and numeric strings', () => {
    expect(toInt(7)).toBe(7)
    expect(toInt('12')).toBe(12)
    expect(toInt('-3')).toBe(-3)
    expect(toInt(4.0)).toBe(4)
  })

  it('uses the fallback for a missing value', () => {
    expect(toInt(null)).toBe(0)
    expect(toInt(undefined)).toBe(0)
    expect(toInt('')).toBe(0)
    expect(toInt(null, 1900)).toBe(1900)
  })

  it('throws on a value that is not a whole number instead of returning 0', () => {
    expect(() => toInt('abc')).toThrow('not a whole number')
    expect(() => toInt(1.5)).toThrow('not a whole number')
    expect(() => toInt(Number.NaN, 5)).toThrow('not a whole number')
  })
})
