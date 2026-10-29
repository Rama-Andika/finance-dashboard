import { sql, type SQL } from 'drizzle-orm'

/** ap_ar_card.module_type */
export const MODULE_TYPE = { AP: 0, AR: 1 } as const

/** ap_ar_card.in_out: the sign that turns `amount` into a signed balance. */
export const IN_OUT_VALUES = [-1, 1] as const

/** ap_ar_card.transaction_type groups (data-model §3 and §6). */
export const AP_INVOICE_TYPES = [0, 1, 2, 3, 4, 5, 6, 12] as const
export const AP_PAYMENT_TYPES = [7, 8, 9, 10, 11, 13, 14] as const
/** AP cards that count as "expense paid" (payment voucher, cash/bank out, etc.). */
export const EXPENSE_PAID_TYPES = [9, 10, 14] as const
/** Ordinary vendor bill; Data Check Q1b looks for such bills marked paid without any allocation. */
export const AP_BILL_TYPE = 1
/** ap_ar_card.payment_status of a fully paid card. */
export const PAYMENT_STATUS_PAID = 2

export const AR_INVOICE_TYPES = [0, 3, 4, 5] as const
/** AR receipt and credit-note types (settle invoices). */
export const AR_SETTLEMENT_TYPES = [1, 2] as const
export const AR_UNALLOCATED_RECEIPT_TYPE = 1
export const AR_UNALLOCATED_CREDIT_TYPE = 2

/** bank_payment.type: customer receipts that sit in a settlement channel. */
export const BANK_PAYMENT_CHANNEL_TYPES = [1, 2] as const
/** bank_payment.status */
export const BANK_PAYMENT_STATUS = { UNSETTLED: 0, SETTLED: 1 } as const

/** Literal integer list for `IN (...)`. Only integers are accepted, so it is safe to inline. */
export function intList(values: readonly number[]): SQL {
  if (values.length === 0) throw new Error('intList: empty list')
  for (const v of values) {
    if (!Number.isInteger(v)) throw new Error(`intList: not an integer: ${v}`)
  }
  return sql.raw(values.join(', '))
}
