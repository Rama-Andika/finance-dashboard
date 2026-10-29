import { D } from '../../core/money'
import type { AccountGroup, Money } from '../../core/types'

export const DEBIT_SIDE_GROUPS: readonly AccountGroup[] = [
  'Liquid Assets',
  'Fixed Assets',
  'Other Assets',
  'Cost Of Sales',
  'Expense',
  'Other Expense',
]

export function accountSide(group: AccountGroup): 'debit' | 'credit' {
  return DEBIT_SIDE_GROUPS.includes(group) ? 'debit' : 'credit'
}

/** Amount signed by the account group's natural side (G17). */
export function signedAmount(group: AccountGroup, debet: Money, credit: Money): Money {
  const d = D(debet || 0)
  const c = D(credit || 0)

  if (accountSide(group) === 'debit') {
    return d.minus(c).toFixed(2)
  }
  return c.minus(d).toFixed(2)
}
