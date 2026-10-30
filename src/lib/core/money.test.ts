import { describe, expect, it } from 'vitest'
import { safeDiv, sum, toChartNumber, largestByAmount } from './money'

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

  it('converts money to a chart number and falls back to 0', () => {
    expect(toChartNumber('1234.50')).toBe(1234.5)
    expect(toChartNumber('-10')).toBe(-10)
    expect(toChartNumber('')).toBe(0)
    expect(toChartNumber(null)).toBe(0)
    expect(toChartNumber('abc')).toBe(0)
  })
})

describe('largestByAmount', () => {
  it('returns undefined for an empty list', () => {
    expect(largestByAmount([])).toBeUndefined()
  })

  it('picks the largest amount, compared as exact money', () => {
    const items = [
      { id: 'a', amount: '1000.50' },
      { id: 'b', amount: '99999999999999999.10' },
      { id: 'c', amount: '99999999999999999.09' },
    ]
    expect(largestByAmount(items)?.id).toBe('b')
  })

  it('keeps the first item on a tie', () => {
    expect(largestByAmount([{ id: 'a', amount: '5.00' }, { id: 'b', amount: '5.00' }])?.id).toBe('a')
  })
})
