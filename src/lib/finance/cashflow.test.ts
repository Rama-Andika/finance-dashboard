import { describe, expect, it } from 'vitest'
import {
  allocateCash,
  classifyBySetup,
  classifyByFallback,
  isSetupValid,
  type CfLine,
} from './cashflow'
import { D } from './money'
import {
  mockCashLines,
  mockCashCoaIds,
  mockCfSetup,
} from '../../../tests/fixtures/cashflow.fixture'

describe('cashflow pure logic and allocation', () => {
  const isOurCash = (l: CfLine) => mockCashCoaIds.includes(l.coaId)

  it('ignores internal cash transfers where all lines touch cash accounts', () => {
    // Only the internal transfer journal gl_2
    const lines = mockCashLines.filter((l) => l.glId === 'gl_2')
    const portions = allocateCash(lines, isOurCash)
    expect(portions).toHaveLength(0)
  })

  it('allocates proportional cash in mixed journal without overcounting counter lines', () => {
    // gl_1: Kas 100 + Piutang 50 -> Pendapatan 150
    const lines = mockCashLines.filter((l) => l.glId === 'gl_1')
    const portions = allocateCash(lines, isOurCash)

    // Net cash is 100 (inflow).
    // Counter lines: Piutang (debet 50, weight 50) and Pendapatan (credit 150, weight 150). Total weight = 200.
    // Portions: Piutang gets 100 * (50/200) = 25.00, Pendapatan gets 100 * (150/200) = 75.00.
    expect(portions).toHaveLength(2)
    const sumPortions = portions.reduce((acc, p) => acc.plus(D(p.portion)), D(0))
    expect(sumPortions.toFixed(2)).toBe('100.00')

    const revPortion = portions.find((p) => p.counterCoaId === '4110')
    expect(revPortion?.portion).toBe('75.00') // not 150.00!
  })

  it('preserves exact net sum on rounding splits', () => {
    // gl_3: Outflow 100 split across 3 lines
    const lines = mockCashLines.filter((l) => l.glId === 'gl_3')
    const portions = allocateCash(lines, isOurCash)

    expect(portions).toHaveLength(3)
    const sumPortions = portions.reduce((acc, p) => acc.plus(D(p.portion)), D(0))
    expect(sumPortions.toFixed(2)).toBe('-100.00') // Exact -100.00
  })

  it('classifies directionally according to valueDisplayed setup rules', () => {
    // Fixed asset purchase (outflow)
    const purchaseClass = classifyBySetup(
      '-500.00',
      { accountGroup: 'Fixed Assets', subAccountGroup: '' },
      mockCfSetup,
    )
    expect(purchaseClass).toEqual({
      drawer: 'INVESTING',
      subGroup: 'Pembelian Asset',
    })

    // Fixed asset sale (inflow)
    const saleClass = classifyBySetup(
      '500.00',
      { accountGroup: 'Fixed Assets', subAccountGroup: '' },
      mockCfSetup,
    )
    expect(saleClass).toEqual({
      drawer: 'INVESTING',
      subGroup: 'Penjualan Asset',
    })
  })

  it('returns UNCLASSIFIED when setup has no match for counter account', () => {
    const unclass = classifyBySetup(
      '-100.00',
      { accountGroup: 'Other Expense', subAccountGroup: '' },
      mockCfSetup,
    )
    expect(unclass).toBe('UNCLASSIFIED')
  })

  it('applies fallback rules when setup is invalid', () => {
    expect(isSetupValid([])).toBe(false)

    // journalType 14 -> FUNDING: bank loan
    const fallbackLoan = classifyByFallback(
      '1000.00',
      { accountGroup: 'Current Liabilities', subAccountGroup: '' },
      14,
    )
    expect(fallbackLoan.drawer).toBe('FUNDING')
    expect(fallbackLoan.subGroup).toBe('cf.fallback.bankLoan')
  })

  it('ensures Cash Opening + Net Cash Flow = Cash Closing identity holds', () => {
    const portions = allocateCash(mockCashLines, isOurCash)
    const netCashFlow = portions.reduce((acc, p) => acc.plus(D(p.portion)), D(0))

    const openingCash = '1000.00'
    const expectedClosing = D(openingCash).plus(netCashFlow).toFixed(2)

    // gl_1 (+100) + gl_2 (0) + gl_3 (-100) = net 0
    expect(netCashFlow.toFixed(2)).toBe('0.00')
    expect(expectedClosing).toBe('1000.00')
  })
})
