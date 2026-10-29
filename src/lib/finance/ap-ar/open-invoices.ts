import { D } from '../../core/money'
import type { Id, Money } from '../../core/types'

export type InvoiceCandidate = { id: Id; original: Money }

const ZERO_RE = /^-?0*(\.0*)?$/

/** True for "0", "0.00", "-0.00" … without going through a decimal for the common case. */
export function isZeroMoney(value: string): boolean {
  return ZERO_RE.test(value.trim())
}

/**
 * Remaining balance of one invoice, or null when it is fully settled. `paid` is the summed allocation
 * (negative numbers) or undefined when nothing was allocated; then the original amount is the balance as is.
 */
export function openBalance(original: Money, paid: Money | undefined): { original: Money; balance: Money } | null {
  if (paid === undefined) return isZeroMoney(original) ? null : { original, balance: original }
  const balance = D(original).plus(D(paid)).toFixed(2)
  return isZeroMoney(balance) ? null : { original: D(original).toFixed(2), balance }
}

/**
 * Open invoices = invoices whose remaining balance is not zero.
 * remaining = original (amount × in_out) + Σ payments allocated to the invoice (details are negative).
 * `payments` has one summed amount per invoice id; invoices without payments keep their original amount.
 */
export function openInvoices(
  candidates: Iterable<InvoiceCandidate>,
  payments: ReadonlyMap<Id, Money>,
): Array<{ id: Id; original: Money; balance: Money }> {
  const open: Array<{ id: Id; original: Money; balance: Money }> = []
  for (const c of candidates) {
    const m = openBalance(c.original, payments.get(c.id))
    if (m) open.push({ id: c.id, ...m })
  }
  return open
}
