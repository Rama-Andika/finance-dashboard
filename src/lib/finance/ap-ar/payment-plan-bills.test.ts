import { describe, expect, it } from 'vitest'
import { PAYMENT_BILL_SORT_KEYS, paymentBillComparators } from './payment-plan-bills'
import type { PaymentPlanBill } from './payment-plan'

const bill = (over: Partial<PaymentPlanBill>): PaymentPlanBill => ({
  invoiceId: '1',
  vendorId: '1',
  vendorName: 'Alpha',
  invoiceNumber: 'INV-1',
  dueDate: '2025-10-15',
  balance: '100.00',
  status: 'approved',
  ...over,
})

describe('paymentBillComparators', () => {
  it('has a comparator for every sort key', () => {
    expect(Object.keys(paymentBillComparators).sort()).toEqual([...PAYMENT_BILL_SORT_KEYS].sort())
  })

  it('sorts by due date as text (ISO dates)', () => {
    const rows = [bill({ dueDate: '2025-11-01' }), bill({ dueDate: '2025-10-01' })]
    rows.sort(paymentBillComparators.dueDate)
    expect(rows.map((r) => r.dueDate)).toEqual(['2025-10-01', '2025-11-01'])
  })

  it('sorts balance numerically, not alphabetically', () => {
    const rows = [bill({ balance: '900.00' }), bill({ balance: '1000.00' }), bill({ balance: '-5.00' })]
    rows.sort(paymentBillComparators.balance)
    expect(rows.map((r) => r.balance)).toEqual(['-5.00', '900.00', '1000.00'])
  })

  it('sorts vendor names ignoring case', () => {
    const rows = [bill({ vendorName: 'bravo' }), bill({ vendorName: 'Alpha' })]
    rows.sort(paymentBillComparators.vendorName)
    expect(rows.map((r) => r.vendorName)).toEqual(['Alpha', 'bravo'])
  })

  it('sorts by status code', () => {
    const rows = [bill({ status: 'submitted' }), bill({ status: 'approved' })]
    rows.sort(paymentBillComparators.status)
    expect(rows.map((r) => r.status)).toEqual(['approved', 'submitted'])
  })
})
