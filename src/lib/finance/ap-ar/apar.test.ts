import { describe, expect, it } from 'vitest'
import { computeApAging, computeArAging } from './apar'
import { planStatus } from './aging'
import { buildCoaTree, type CoaRow } from '../coa/coa-tree'
import {
  mockApPartA,
  mockApPartB,
  mockArPartA,
  mockArPartB,
} from '../../../../tests/fixtures/apar.fixture'

const mockCoa: CoaRow[] = [
  {
    coaId: '2110',
    parentId: '0',
    code: '2-1100',
    name: 'Hutang Usaha',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Current Liabilities',
    subAccountGroup: 'Account Payable',
    saldoNormal: 'CREDIT',
  },
  {
    coaId: '1140',
    parentId: '0',
    code: '1-1400',
    name: 'Piutang Usaha',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Liquid Assets',
    subAccountGroup: 'Account Receivable',
    saldoNormal: 'DEBET',
  },
]

describe('ap aging calculations', () => {
  const tree = buildCoaTree(mockCoa)
  const asOf = '2026-10-28'
  const vendors = new Map([
    ['v1', { code: 'V01', name: 'Vendor One' }],
    ['v2', { code: 'V02', name: 'Vendor Two' }],
  ])

  it('overdueBills counts only positive bills past due, while overdueSubtotal is net', () => {
    const res = computeApAging({ partA: mockApPartA, partB: mockApPartB, asOf, vendors, tree })

    // inv_1 (800.00, 13 days past due) is the only positive overdue bill; inv_2 is not due yet.
    expect(res.overdueBills).toBe('800.00')
    // The net overdue figure also carries the vendor credit (-100.00, due 3 days ago) and the unallocated payment (-200.00).
    expect(res.overdueSubtotal).toBe('500.00')
  })

  it('calculates net total, unpaid bills, vendor credits, and unallocated payments', () => {
    const res = computeApAging({
      partA: mockApPartA,
      partB: mockApPartB,
      asOf,
      vendors,
      tree,
    })

    // Unpaid bills = 800 + 500 = 1300.00
    expect(res.unpaidBills).toBe('1300.00')
    // Vendor credits = -100.00
    expect(res.vendorCredits).toBe('-100.00')
    // Unallocated payments = -200.00
    expect(res.unallocatedPayments).toBe('-200.00')
    // Net total = 1300 - 100 - 200 = 1000.00
    expect(res.total).toBe('1000.00')

    // By vendor
    const v1 = res.byVendor.find((v) => v.vendorId === 'v1')
    // v1: 800 (inv_1) - 100 (ret_1) - 200 (pay_unalloc_1) = 500.00
    expect(v1?.total).toBe('500.00')

    const v2 = res.byVendor.find((v) => v.vendorId === 'v2')
    expect(v2?.total).toBe('500.00')

    // Control accounts includes 2110
    expect(res.controlAccounts).toHaveLength(1)
    expect(res.controlAccounts[0]?.coaId).toBe('2110')
  })

  it('correctly aggregates overdue subtotal across the 4 overdue buckets', () => {
    const res = computeApAging({
      partA: mockApPartA,
      partB: mockApPartB,
      asOf,
      vendors,
      tree,
    })

    // Overdue items:
    // inv_1: 800.00 (overdue0_30)
    // ret_1: -100.00 (overdue0_30)
    // pay_unalloc_1: -200.00 (overdue0_30)
    // Overdue subtotal = 800 - 100 - 200 = 500.00
    expect(res.buckets.overdue0_30).toBe('500.00')
    expect(res.overdueSubtotal).toBe('500.00')
    // inv_2: 500.00 (due1_30)
    expect(res.buckets.due1_30).toBe('500.00')
  })

  it('keeps approved status for invoices on Posted vouchers regardless of payment_status', () => {
    // In ERP, an unpaid invoice in an approved voucher has payment_status=2
    // It must still be counted as debt and have status 'approved'
    const status = planStatus(['Posted'])
    expect(status).toBe('approved')
  })
})

describe('ar aging calculations', () => {
  const tree = buildCoaTree(mockCoa)
  const asOf = '2026-10-28'
  const customers = new Map([
    ['c1', { code: 'C01', name: 'Customer One' }],
    ['c2', { code: 'C02', name: 'Customer Two' }],
  ])

  it('calculates net total, unpaid invoices, unallocated returns, and non-trade receivables', () => {
    const res = computeArAging({
      partA: mockArPartA,
      partB: mockArPartB,
      asOf,
      customers,
      tree,
    })

    // Unpaid invoices = 1500 + 300 = 1800.00
    expect(res.unpaidInvoices).toBe('1800.00')
    // Unallocated returns = -100.00
    expect(res.unallocatedReturns).toBe('-100.00')
    // Non-trade receivable = 300.00
    expect(res.nonTrade).toBe('300.00')
    // Net total = 1800 - 100 = 1700.00
    expect(res.total).toBe('1700.00')

    const c1 = res.byCustomer.find((c) => c.customerId === 'c1')
    expect(c1?.total).toBe('1400.00') // 1500 - 100

    const c2 = res.byCustomer.find((c) => c.customerId === 'c2')
    expect(c2?.total).toBe('300.00')
  })
})
