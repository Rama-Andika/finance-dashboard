import { describe, expect, it } from 'vitest'
import { safeDiv, sum } from './money'

describe('money helpers', () => {
  it('sums float-like values accurately', () => {
    expect(sum(['0.1', '0.2'])).toBe('0.30')
  })

  it('handles empty arrays and null values', () => {
    expect(sum([])).toBe('0.00')
    expect(sum([null, '5'])).toBe('5.00')
  })

  it('performs safe division with zero division handling', () => {
    expect(safeDiv('10', '0')).toBeNull()
    expect(safeDiv('1', '4')).toBe('0.25')
  })

  it('preserves precision with very large numbers without losing digits', () => {
    expect(sum(['123456789012345678.99', '0.01'])).toBe('123456789012345679.00')
  })
})
