import { D } from '../../core/money'
import type { Id, Money } from '../../core/types'

/**
 * Sums, per invoice, the amounts that settlement cards allocated to it. The detail rows arrive one at a time (a scan of
 * about two million rows is streamed, never held as one array). It gives what `SELECT invoice_id, SUM(amount) ... GROUP
 * BY invoice_id` over the detail rows of the settlement cards gives: rows of other cards, rows without an invoice and
 * rows without an amount count for nothing.
 */
export function createSettlementSums(settlementCardIds: ReadonlySet<Id>) {
  const sums = new Map<Id, Money>()
  return {
    /** One row of ap_ar_card_detail: the invoice, the settlement card and the amount (all as the driver gives them). */
    add(invoiceId: unknown, cardId: unknown, amount: unknown): void {
      if (invoiceId === null || invoiceId === undefined || amount === null || amount === undefined) return
      if (!settlementCardIds.has(String(cardId))) return
      const id = String(invoiceId)
      const value = String(amount)
      const previous = sums.get(id)
      // The first amount of an invoice is kept as the text it came in; a decimal is only made for a second one.
      sums.set(id, previous === undefined ? value : D(previous).plus(D(value)).toFixed())
    },
    /** The summed amount per invoice id. */
    result(): Map<Id, Money> {
      return sums
    },
  }
}
