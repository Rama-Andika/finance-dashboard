import { D } from '../../core/money'
import type { Money } from '../../core/types'

const ZERO_RE = /^-?0*(\.0*)?$/

/** True for "0", "0.00", "-0.00" … without going through a decimal for the common case. */
export function isZeroMoney(value: string): boolean {
  return ZERO_RE.test(value.trim())
}

/**
 * Remaining balance of one invoice, or null when it is fully settled (an open invoice has a balance that is not zero).
 * remaining = original (amount × in_out) + Σ payments allocated to the invoice (details are negative).
 * `paid` is the summed allocation or undefined when nothing was allocated; then the original amount is the balance as is.
 */
export function openBalance(original: Money, paid: Money | undefined): { original: Money; balance: Money } | null {
  if (paid === undefined) return isZeroMoney(original) ? null : { original, balance: original }
  const balance = D(original).plus(D(paid)).toFixed(2)
  return isZeroMoney(balance) ? null : { original: D(original).toFixed(2), balance }
}
