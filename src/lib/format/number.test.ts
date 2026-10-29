import { describe, expect, it } from 'vitest'
import {
  formatAxisShort,
  formatMoneyFull,
  formatMoneyShort,
  formatPercent,
} from './number'

describe('formatMoneyShort', () => {
  it('formats large numbers correctly in ID and EN', () => {
    expect(formatMoneyShort('42560118400', 'id')).toBe('Rp\u200942,56\u00a0M')
    expect(formatMoneyShort('42560118400', 'en')).toBe('IDR\u200942.56B')
  })

  it('formats millions correctly in ID and EN', () => {
    expect(formatMoneyShort('1500000', 'id')).toBe('Rp\u20091,50\u00a0Jt')
    expect(formatMoneyShort('1500000', 'en')).toBe('IDR\u20091.50M')
  })

  it('bumps tier after rounding when near threshold (999.995.000 -> 1,00 M)', () => {
    expect(formatMoneyShort('999995000', 'id')).toBe('Rp\u20091,00\u00a0M')
    expect(formatMoneyShort('999995000', 'en')).toBe('IDR\u20091.00B')
  })

  it('handles negative values with U+2212 minus sign before prefix', () => {
    expect(formatMoneyShort('-1200000', 'id')).toBe('\u2212Rp\u20091,20\u00a0Jt')
    expect(formatMoneyShort('-1200000', 'en')).toBe('\u2212IDR\u20091.20M')
  })

  it('formats numbers under 1000 without unit or decimals', () => {
    expect(formatMoneyShort('950', 'id')).toBe('Rp\u2009950')
    expect(formatMoneyShort('950', 'en')).toBe('IDR\u2009950')
  })
})

describe('formatMoneyFull', () => {
  it('formats positive values with localized thousand separators and 0 decimals by default', () => {
    expect(formatMoneyFull('42560118400', 'id')).toBe('42.560.118.400')
    expect(formatMoneyFull('42560118400', 'en')).toBe('42,560,118,400')
  })

  it('formats negative values in parentheses without currency prefix', () => {
    expect(formatMoneyFull('-1234500', 'id')).toBe('(1.234.500)')
    expect(formatMoneyFull('-1234500', 'en')).toBe('(1,234,500)')
  })
})

describe('formatPercent', () => {
  it('formats ratio to percent with 2 decimals', () => {
    expect(formatPercent('0.0284', 'id')).toBe('2,84%')
    expect(formatPercent('0.0284', 'en')).toBe('2.84%')
  })

  it('formats null to em-dash', () => {
    expect(formatPercent(null, 'id')).toBe('—')
    expect(formatPercent(null, 'en')).toBe('—')
  })
})

describe('formatAxisShort', () => {
  it('formats chart axis numbers cleanly', () => {
    expect(formatAxisShort(10000000000, 'id')).toBe('10 M')
    expect(formatAxisShort(10000000000, 'en')).toBe('10B')
    expect(formatAxisShort(-5000000000, 'id')).toBe('\u22125 M')
    expect(formatAxisShort(-5000000000, 'en')).toBe('\u22125B')
  })
})
