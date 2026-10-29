import { describe, expect, it } from 'vitest'
import { accountSide, signedAmount } from './sign'

describe('accountSide', () => {
  it('returns debit for debit side groups', () => {
    expect(accountSide('Liquid Assets')).toBe('debit')
    expect(accountSide('Fixed Assets')).toBe('debit')
    expect(accountSide('Cost Of Sales')).toBe('debit')
    expect(accountSide('Expense')).toBe('debit')
  })

  it('returns credit for credit side groups', () => {
    expect(accountSide('Revenue')).toBe('credit')
    expect(accountSide('Current Liabilities')).toBe('credit')
    expect(accountSide('Equity')).toBe('credit')
  })
})

describe('signedAmount', () => {
  it('computes natural sign for revenue and expense', () => {
    expect(signedAmount('Revenue', '0', '100')).toBe('100.00')
    expect(signedAmount('Expense', '100', '0')).toBe('100.00')
  })

  it('handles contra-accounts correctly in assets (accumulated depreciation & allowance)', () => {
    // Akumulasi Penyusutan in Fixed Assets with credit 50 -> -50.00
    expect(signedAmount('Fixed Assets', '0', '50')).toBe('-50.00')
    // Cadangan Piutang in Liquid Assets with credit 30 -> -30.00
    expect(signedAmount('Liquid Assets', '0', '30')).toBe('-30.00')
  })

  it('handles decimal amounts without precision loss', () => {
    expect(signedAmount('Liquid Assets', '1234.56', '234.56')).toBe('1000.00')
    expect(signedAmount('Current Liabilities', '100.25', '600.75')).toBe('500.50')
  })
})
