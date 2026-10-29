import type { AccountGroup } from './types'

/** Groups that make up the P&L (and the Budget vs Actual rows). */
export const PNL_ACCOUNT_GROUPS: readonly AccountGroup[] = [
  'Revenue',
  'Cost Of Sales',
  'Expense',
  'Other Revenue',
  'Other Expense',
]

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
