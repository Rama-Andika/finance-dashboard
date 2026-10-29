import { describe, expect, it } from 'vitest'
import {
  DIRECT_EXPENSE_GROUPS,
  INCOME_GROUPS,
  PNL_ACCOUNT_GROUPS,
  isDirectExpenseGroup,
  isIncomeGroup,
} from './account-groups'

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
