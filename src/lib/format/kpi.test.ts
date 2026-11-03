import { describe, expect, it } from 'vitest'
import { computeChangePercent, isMoney, kpiFigures } from './kpi'
import { formatAmountShort, formatMoneyFull, formatMoneyShort } from './number'

describe('isMoney', () => {
  it('accepts money strings and rejects text', () => {
    expect(isMoney('1234.50')).toBe(true)
    expect(isMoney('-5')).toBe(true)
    expect(isMoney('12 months')).toBe(false)
    expect(isMoney('')).toBe(false)
    expect(isMoney(null)).toBe(false)
    expect(isMoney(undefined)).toBe(false)
  })
})

describe('computeChangePercent', () => {
  it('computes the change against the previous value', () => {
    expect(computeChangePercent('150.00', '100.00')).toBe('50.00')
    expect(computeChangePercent('50.00', '100.00')).toBe('-50.00')
  })

  it('measures a change from a negative value against its size', () => {
    expect(computeChangePercent('-50.00', '-100.00')).toBe('50.00')
  })

  it('is null without a usable comparison', () => {
    expect(computeChangePercent('10', '0')).toBeNull()
    expect(computeChangePercent('10', null)).toBeNull()
    expect(computeChangePercent(null, '10')).toBeNull()
    expect(computeChangePercent('text', '10')).toBeNull()
  })
})

describe('kpiFigures', () => {
  it('formats a money value and its comparison', () => {
    const f = kpiFigures({ value: '1234567.50', compareValue: '1000000.00', currency: 'IDR', lang: 'en' })
    expect(f.valueIsMoney).toBe(true)
    expect(f.shortValue).toBe(formatAmountShort('1234567.50', 'en'))
    expect(f.fullValue).toBe(`IDR ${formatMoneyFull('1234567.50', 'en', { decimals: 2 })}`)
    expect(f.compareShort).toBe(formatMoneyShort('1000000.00', 'en'))
    expect(f.changePercent).toBe('23.46')
  })

  it('shows plain text as it is, without a full figure of its own', () => {
    const f = kpiFigures({ value: 'Cash flow positive', compareValue: undefined, currency: 'IDR', lang: 'id' })
    expect(f).toEqual({
      valueIsMoney: false,
      shortValue: 'Cash flow positive',
      fullValue: 'Cash flow positive',
      compareShort: '',
      changePercent: null,
    })
  })

  it('shows a dash when there is no value', () => {
    const f = kpiFigures({ value: null, compareValue: '10', currency: 'IDR', lang: 'en' })
    expect(f.shortValue).toBe('–')
    expect(f.fullValue).toBe('–')
    expect(f.changePercent).toBeNull()
  })
})
