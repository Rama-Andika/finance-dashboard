import { sum } from '~/lib/core/money'
import type { Money } from '~/lib/core/types'
import { compareMoney, compareText, type Comparator } from '~/lib/table/query'
import type { PaymentPlanBill } from './payment-plan'

/** Which bills a table shows: due within the horizon, or already past due. */
export const BILL_SCOPES = ['due', 'overdue'] as const
export type BillScope = (typeof BILL_SCOPES)[number]

export function filterBillsByScope(bills: readonly PaymentPlanBill[], scope: BillScope): PaymentPlanBill[] {
  return bills.filter((b) => (scope === 'overdue' ? b.overdue : !b.overdue))
}

export type BillScopeSummary = Record<BillScope, { count: number; total: Money }>

/** Count and total balance of both scopes, for the tab labels. */
export function summarizeBillScopes(bills: readonly PaymentPlanBill[]): BillScopeSummary {
  const due = filterBillsByScope(bills, 'due')
  const overdue = filterBillsByScope(bills, 'overdue')
  return {
    due: { count: due.length, total: sum(due.map((b) => b.balance)) },
    overdue: { count: overdue.length, total: sum(overdue.map((b) => b.balance)) },
  }
}

export const PAYMENT_BILL_SORT_KEYS = ['dueDate', 'balance', 'vendorName', 'status'] as const
export type PaymentBillSortKey = (typeof PAYMENT_BILL_SORT_KEYS)[number]

export const paymentBillComparators: Record<PaymentBillSortKey, Comparator<PaymentPlanBill>> = {
  dueDate: (a, b) => compareText(a.dueDate, b.dueDate),
  balance: (a, b) => compareMoney(a.balance, b.balance),
  vendorName: (a, b) => compareText(a.vendorName, b.vendorName),
  status: (a, b) => compareText(a.status, b.status),
}
