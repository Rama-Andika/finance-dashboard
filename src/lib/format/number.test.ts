import { describe, expect, it } from 'vitest'
import {
  formatAmountShort,
  formatAxisShort,
  formatMoneyFull,
  formatMoneyShort,
  formatPercent,
} from './number'

describe('formatMoneyShort', () => {
  it('uses the same units and separators in every language', () => {
    expect(formatMoneyShort('42560118400', 'id')).toBe('IDR 42.56B')
    expect(formatMoneyShort('42560118400', 'en')).toBe('IDR 42.56B')
    expect(formatMoneyShort('1500000', 'id')).toBe('IDR 1.50M')
    expect(formatMoneyShort('1500000', 'en')).toBe('IDR 1.50M')
    expect(formatMoneyShort('2500', 'id')).toBe('IDR 2.50K')
  })

  it('bumps the unit after rounding near a threshold (999,995,000 -> 1.00B)', () => {
    expect(formatMoneyShort('999995000')).toBe('IDR 1.00B')
  })

  it('puts the U+2212 minus sign before the prefix for negative values', () => {
    expect(formatMoneyShort('-1200000')).toBe('−IDR 1.20M')
  })

  it('shows numbers under 1,000 without unit or decimals', () => {
    expect(formatMoneyShort('950')).toBe('IDR 950')
    expect(formatMoneyShort('0')).toBe('IDR 0')
  })

  it('supports trillions', () => {
    expect(formatMoneyShort('1250000000000')).toBe('IDR 1.25T')
  })
})

describe('formatMoneyFull', () => {
  it('formats 1,000,000 the same way in both languages', () => {
    expect(formatMoneyFull('1000000', 'id')).toBe('1,000,000')
    expect(formatMoneyFull('1000000', 'en')).toBe('1,000,000')
    expect(formatMoneyFull('42560118400', 'id')).toBe('42,560,118,400')
    expect(formatMoneyFull('42560118400', 'en')).toBe('42,560,118,400')
  })

  it('has no separator below 1,000 and handles zero', () => {
    expect(formatMoneyFull('999')).toBe('999')
    expect(formatMoneyFull('1000')).toBe('1,000')
    expect(formatMoneyFull('0')).toBe('0')
  })

  it('uses "." for decimals when 2 decimals are requested', () => {
    expect(formatMoneyFull('1234567.5', 'id', { decimals: 2 })).toBe('1,234,567.50')
  })

  it('rounds half up at the last shown digit', () => {
    expect(formatMoneyFull('1000.5')).toBe('1,001')
    expect(formatMoneyFull('999.49')).toBe('999')
  })

  it('formats negative values in parentheses without a currency prefix', () => {
    expect(formatMoneyFull('-1234500', 'id')).toBe('(1,234,500)')
  })
})

describe('formatPercent', () => {
  it('uses "." for decimals in both languages', () => {
    expect(formatPercent('0.0284', 'id')).toBe('2.84%')
    expect(formatPercent('0.0284', 'en')).toBe('2.84%')
  })

  it('formats null to em-dash', () => {
    expect(formatPercent(null)).toBe('—')
  })
})

describe('formatAxisShort', () => {
  it('formats chart axis numbers cleanly', () => {
    expect(formatAxisShort(10000000000, 'id')).toBe('10B')
    expect(formatAxisShort(10000000000, 'en')).toBe('10B')
    expect(formatAxisShort(-5000000000)).toBe('−5B')
    expect(formatAxisShort(0)).toBe('0')
  })
})

describe('formatAmountShort', () => {
  it('abbreviates without the currency prefix', () => {
    expect(formatAmountShort('42560118400', 'id')).toBe('42.56B')
    expect(formatAmountShort('-1200000')).toBe('−1.20M')
  })
})
