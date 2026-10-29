import { compareMoney, compareText, type Comparator } from '~/lib/table/query'
import type { PaymentPlanBill } from './payment-plan'

export const PAYMENT_BILL_SORT_KEYS = ['dueDate', 'balance', 'vendorName', 'status'] as const
export type PaymentBillSortKey = (typeof PAYMENT_BILL_SORT_KEYS)[number]

export const paymentBillComparators: Record<PaymentBillSortKey, Comparator<PaymentPlanBill>> = {
  dueDate: (a, b) => compareText(a.dueDate, b.dueDate),
  balance: (a, b) => compareMoney(a.balance, b.balance),
  vendorName: (a, b) => compareText(a.vendorName, b.vendorName),
  status: (a, b) => compareText(a.status, b.status),
}
