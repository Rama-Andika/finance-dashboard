import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import {
  formatAmountShort,
  formatAxisShort,
  formatChangePercent,
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

  it('writes negative values in parentheses, not with a minus sign', () => {
    expect(formatMoneyShort('-1200000')).toBe('(IDR 1.20M)')
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
    expect(formatAxisShort(-5000000000)).toBe('(5B)')
    expect(formatAxisShort(0)).toBe('0')
  })
})

describe('formatAmountShort', () => {
  it('abbreviates without the currency prefix', () => {
    expect(formatAmountShort('42560118400', 'id')).toBe('42.56B')
    expect(formatAmountShort('-1200000')).toBe('(1.20M)')
  })
})

describe('formatChangePercent', () => {
  it('formats null (no comparison amount) to em-dash and zero to 0.0%', () => {
    expect(formatChangePercent(null)).toBe('—')
    expect(formatChangePercent('')).toBe('—')
    expect(formatChangePercent('0')).toBe('0.0%')
  })

  it('uses one decimal from 0.1% up and puts a negative change in parentheses', () => {
    expect(formatChangePercent('0.25')).toBe('25.0%')
    expect(formatChangePercent('-0.125')).toBe('(12.5%)')
    expect(formatChangePercent('0.001')).toBe('0.1%')
    expect(formatChangePercent('1.2345')).toBe('123.5%')
  })

  it('adds decimals until the first digit that is not zero shows', () => {
    expect(formatChangePercent('0.0005')).toBe('0.05%')
    expect(formatChangePercent('0.0000143')).toBe('0.001%')
    expect(formatChangePercent('-0.0000143')).toBe('(0.001%)')
    expect(formatChangePercent('0.000001')).toBe('0.0001%')
  })

  it('leaves out the zero at the end when rounding carries into the next power of ten', () => {
    expect(formatChangePercent('0.000999')).toBe('0.1%')
    expect(formatChangePercent('0.0000999')).toBe('0.01%')
    expect(formatChangePercent('0.00000999')).toBe('0.001%')
    expect(formatChangePercent('-0.000999')).toBe('(0.1%)')
    expect(formatChangePercent('0.000949')).toBe('0.09%')
  })

  it('writes "<0.0001%" for a change too small to show', () => {
    expect(formatChangePercent('0.0000000382')).toBe('<0.0001%')
    expect(formatChangePercent('-0.000000035')).toBe('(<0.0001%)')
  })

  it('reads a ratio written with an exponent', () => {
    expect(formatChangePercent('3.82e-7')).toBe('<0.0001%')
    expect(formatChangePercent('-2.28e-6')).toBe('(0.0002%)')
  })

  it('gives readable results for six balance sheet rows with large balances', () => {
    // change divided by the comparison amount: [change, comparison amount]
    const rows: [string, string][] = [
      ['150000', '360000000000'],
      ['130000', '56000000000'],
      ['130000', '9000000000'],
      ['-1300', '37000000000'],
      ['0', '10000000000'],
      ['1300', '37000000000'],
    ]
    const texts = rows.map(([change, compare]) => formatChangePercent(new Decimal(change).div(compare).toString()))
    expect(texts).toEqual(['<0.0001%', '0.0002%', '0.001%', '(<0.0001%)', '0.0%', '<0.0001%'])
  })
})
