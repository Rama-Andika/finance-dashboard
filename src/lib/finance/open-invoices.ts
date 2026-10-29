import { D } from './money'
import type { Id, Money } from './types'

export type InvoiceCandidate = { id: Id; original: Money }

const ZERO_RE = /^-?0*(\.0*)?$/

/** True for "0", "0.00", "-0.00" … without going through a decimal for the common case. */
export function isZeroMoney(value: string): boolean {
  return ZERO_RE.test(value.trim())
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
    const paid = payments.get(c.id)
    const balance = paid === undefined ? D(c.original).toFixed(2) : D(c.original).plus(D(paid)).toFixed(2)
    if (!isZeroMoney(balance)) open.push({ id: c.id, original: D(c.original).toFixed(2), balance })
  }
  return open
}
