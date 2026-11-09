import { describe, expect, it } from 'vitest'
import {
  ASSET_GROUPS,
  BALANCE_SHEET_GROUPS,
  DIRECT_EXPENSE_GROUPS,
  EQUITY_GROUPS,
  INCOME_GROUPS,
  LIABILITY_GROUPS,
  PNL_ACCOUNT_GROUPS,
  isBalanceSheetGroup,
  isDirectExpenseGroup,
  isIncomeGroup,
} from './account-groups'
import { accountSide } from './sign'

describe('balance sheet groups', () => {
  it('lists the assets, then the liabilities, then the equity group', () => {
    expect(BALANCE_SHEET_GROUPS).toEqual([
      'Liquid Assets',
      'Fixed Assets',
      'Other Assets',
      'Current Liabilities',
      'Long Term Liabilities',
      'Equity',
    ])
  })

  it('shares no group with the P&L', () => {
    for (const g of BALANCE_SHEET_GROUPS) expect(PNL_ACCOUNT_GROUPS).not.toContain(g)
  })

  it('has the debit side for assets and the credit side for liabilities and equity', () => {
    for (const g of ASSET_GROUPS) expect(accountSide(g)).toBe('debit')
    for (const g of [...LIABILITY_GROUPS, ...EQUITY_GROUPS]) expect(accountSide(g)).toBe('credit')
  })

  it('recognises a balance sheet group by name', () => {
    expect(isBalanceSheetGroup('Equity')).toBe(true)
    expect(isBalanceSheetGroup('Revenue')).toBe(false)
    expect(isBalanceSheetGroup('unknown')).toBe(false)
  })
})

describe('account group lists', () => {
  it('keeps the P&L groups in statement order', () => {
    expect(PNL_ACCOUNT_GROUPS).toEqual(['Revenue', 'Cost Of Sales', 'Expense', 'Other Revenue', 'Other Expense'])
  })

  it('only lists P&L groups as direct expense or income groups', () => {
    for (const g of [...DIRECT_EXPENSE_GROUPS, ...INCOME_GROUPS]) expect(PNL_ACCOUNT_GROUPS).toContain(g)
  })

  it('never treats a group as both income and direct expense', () => {
    for (const g of PNL_ACCOUNT_GROUPS) expect(isIncomeGroup(g) && isDirectExpenseGroup(g)).toBe(false)
  })

  it('classifies direct expense groups', () => {
    expect(isDirectExpenseGroup('Cost Of Sales')).toBe(true)
    expect(isDirectExpenseGroup('Expense')).toBe(true)
    expect(isDirectExpenseGroup('Other Expense')).toBe(false)
    expect(isDirectExpenseGroup('Revenue')).toBe(false)
  })

  it('classifies income groups', () => {
    expect(isIncomeGroup('Revenue')).toBe(true)
    expect(isIncomeGroup('Other Revenue')).toBe(true)
    expect(isIncomeGroup('Expense')).toBe(false)
    expect(isIncomeGroup('unknown')).toBe(false)
  })
})
