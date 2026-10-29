import type {
  ApOpenInvoiceRow,
  ApUnallocatedPaymentRow,
  ArOpenInvoiceRow,
  ArUnallocatedReceiptRow,
} from '~/server/repo/aging.repo'

export const mockApPartA: ApOpenInvoiceRow[] = [
  // Invoice 1: 1000.00, due in past (overdue0_30), balance 800.00
  {
    invoiceId: 'inv_1',
    vendorId: 'v1',
    locationId: 'loc1',
    coaId: '2110',
    txDate: '2026-10-01',
    dueDate: '2026-10-15', // 13 days overdue relative to 2026-10-28
    itemType: 0,
    originalAmount: '1000.00',
    balance: '800.00',
  },
  // Invoice 2: 500.00, due in future (due1_30), balance 500.00
  {
    invoiceId: 'inv_2',
    vendorId: 'v2',
    locationId: 'loc1',
    coaId: '2110',
    txDate: '2026-10-20',
    dueDate: '2026-11-10', // 13 days in future
    itemType: 0,
    originalAmount: '500.00',
    balance: '500.00',
  },
  // Vendor credit: return invoice, balance -100.00
  {
    invoiceId: 'ret_1',
    vendorId: 'v1',
    locationId: 'loc1',
    coaId: '2110',
    txDate: '2026-10-25',
    dueDate: '2026-10-25',
    itemType: 2,
    originalAmount: '-100.00',
    balance: '-100.00',
  },
]

export const mockApPartB: ApUnallocatedPaymentRow[] = [
  // Unallocated payment card to v1: -200.00
  {
    cardId: 'pay_unalloc_1',
    vendorId: 'v1',
    locationId: 'loc1',
    coaId: '2110',
    txDate: '2026-10-26',
    balance: '-200.00',
  },
]

export const mockArPartA: ArOpenInvoiceRow[] = [
  // Customer invoice: 1500.00, due in past
  {
    invoiceId: 'ar_inv_1',
    customerId: 'c1',
    locationId: 'loc1',
    coaId: '1140',
    txDate: '2026-10-01',
    dueDate: '2026-10-10',
    itemType: 0,
    originalAmount: '1500.00',
    balance: '1500.00',
  },
  // Customer non-trade receivable: itemType 3, 300.00
  {
    invoiceId: 'ar_nontrade_1',
    customerId: 'c2',
    locationId: 'loc1',
    coaId: '1140',
    txDate: '2026-10-15',
    dueDate: '2026-10-25',
    itemType: 3,
    originalAmount: '300.00',
    balance: '300.00',
  },
]

export const mockArPartB: ArUnallocatedReceiptRow[] = [
  // Unallocated customer return: -100.00
  {
    cardId: 'ar_ret_unalloc',
    customerId: 'c1',
    locationId: 'loc1',
    coaId: '1140',
    txDate: '2026-10-26',
    balance: '-100.00',
  },
]
