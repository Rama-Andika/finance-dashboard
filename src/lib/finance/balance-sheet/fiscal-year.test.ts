import { describe, expect, it } from 'vitest'
import { DEFAULT_FISCAL_END_MONTH, fiscalEndMonthOf, fiscalYearStart, previousFiscalYearEndKey } from './fiscal-year'

describe('fiscalEndMonthOf', () => {
  it('turns the 0-based ERP month into 1–12', () => {
    expect(fiscalEndMonthOf(0)).toBe(1)
    expect(fiscalEndMonthOf(5)).toBe(6)
    expect(fiscalEndMonthOf(11)).toBe(12)
  })

  it('accepts a number written as text', () => {
    expect(fiscalEndMonthOf('11')).toBe(12)
  })

  it('gives null for a missing or impossible value', () => {
    expect(fiscalEndMonthOf(null)).toBeNull()
    expect(fiscalEndMonthOf(undefined)).toBeNull()
    expect(fiscalEndMonthOf('')).toBeNull()
    expect(fiscalEndMonthOf(12)).toBeNull()
    expect(fiscalEndMonthOf(-1)).toBeNull()
    expect(fiscalEndMonthOf(1.5)).toBeNull()
    expect(fiscalEndMonthOf('abc')).toBeNull()
  })

  it('has December as the default last month', () => {
    expect(DEFAULT_FISCAL_END_MONTH).toBe(12)
  })
})

describe('fiscalYearStart', () => {
  it('starts in January when the fiscal year ends in December', () => {
    expect(fiscalYearStart('2026-01-01', 12)).toBe('2026-01-01')
    expect(fiscalYearStart('2026-03-15', 12)).toBe('2026-01-01')
    expect(fiscalYearStart('2026-12-31', 12)).toBe('2026-01-01')
  })

  it('starts in July when the fiscal year ends in June', () => {
    expect(fiscalYearStart('2026-09-01', 6)).toBe('2026-07-01')
    expect(fiscalYearStart('2026-07-01', 6)).toBe('2026-07-01')
    expect(fiscalYearStart('2026-06-10', 6)).toBe('2025-07-01')
    expect(fiscalYearStart('2026-01-20', 6)).toBe('2025-07-01')
  })

  it('starts in April when the fiscal year ends in March', () => {
    expect(fiscalYearStart('2026-01-01', 3)).toBe('2025-04-01')
    expect(fiscalYearStart('2026-04-01', 3)).toBe('2026-04-01')
  })
})

describe('previousFiscalYearEndKey', () => {
  it('is December of the year before for a fiscal year that ends in December', () => {
    expect(previousFiscalYearEndKey('2026-03-01', 12)).toBe('2025-12')
    expect(previousFiscalYearEndKey('2026-12-01', 12)).toBe('2025-12')
    expect(previousFiscalYearEndKey('2026-01-01', 12)).toBe('2025-12')
  })

  it('follows a fiscal year that ends in June', () => {
    expect(previousFiscalYearEndKey('2026-09-01', 6)).toBe('2026-06')
    expect(previousFiscalYearEndKey('2026-06-01', 6)).toBe('2025-06')
    expect(previousFiscalYearEndKey('2026-02-01', 6)).toBe('2025-06')
  })
})
