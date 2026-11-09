import type { AccountGroup } from '../../core/types'

/** Groups that make up the P&L (and the Budget vs Actual rows). */
export const PNL_ACCOUNT_GROUPS: readonly AccountGroup[] = [
  'Revenue',
  'Cost Of Sales',
  'Expense',
  'Other Revenue',
  'Other Expense',
]

/** Groups on the assets side (Aktiva) of the balance sheet. */
export const ASSET_GROUPS: readonly AccountGroup[] = ['Liquid Assets', 'Fixed Assets', 'Other Assets']

/** Liability groups; together with the equity group they make the liabilities and equity side (Pasiva). */
export const LIABILITY_GROUPS: readonly AccountGroup[] = ['Current Liabilities', 'Long Term Liabilities']

export const EQUITY_GROUPS: readonly AccountGroup[] = ['Equity']

/** Every group that appears on the balance sheet, in statement order. */
export const BALANCE_SHEET_GROUPS: readonly AccountGroup[] = [...ASSET_GROUPS, ...LIABILITY_GROUPS, ...EQUITY_GROUPS]

export function isBalanceSheetGroup(group: string): boolean {
  return (BALANCE_SHEET_GROUPS as readonly string[]).includes(group)
}

/** Groups whose cash payments count as "direct expense paid". */
export const DIRECT_EXPENSE_GROUPS: readonly AccountGroup[] = ['Cost Of Sales', 'Expense']

export function isDirectExpenseGroup(group: string): boolean {
  return (DIRECT_EXPENSE_GROUPS as readonly string[]).includes(group)
}

/** Groups on the income side of the P&L (credit-natured). */
export const INCOME_GROUPS: readonly AccountGroup[] = ['Revenue', 'Other Revenue']

export function isIncomeGroup(group: string): boolean {
  return (INCOME_GROUPS as readonly string[]).includes(group)
}
