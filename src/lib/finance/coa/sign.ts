import type Decimal from 'decimal.js'
import { D } from '../../core/money'
import type { AccountGroup, Money } from '../../core/types'

const DEBIT_SIDE_GROUPS: readonly AccountGroup[] = [
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

/** Amount signed by the account group's natural side (G17), not rounded: add these up and round once at the end. */
export function signedDecimal(group: AccountGroup, debet: Money, credit: Money): Decimal {
  const d = D(debet || 0)
  const c = D(credit || 0)
  return accountSide(group) === 'debit' ? d.minus(c) : c.minus(d)
}

/** Amount signed by the account group's natural side (G17), as a 2-decimal string. */
export function signedAmount(group: AccountGroup, debet: Money, credit: Money): Money {
  return signedDecimal(group, debet, credit).toFixed(2)
}
