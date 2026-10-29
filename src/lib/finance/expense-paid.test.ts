import { describe, expect, it } from 'vitest'
import { computeExpensePaidBreakdown } from './expense-paid'
import { buildCoaTree, type CoaRow } from './coa-tree'

const mockCoa: CoaRow[] = [
  {
    coaId: '5100',
    parentId: '0',
    code: '5-1000',
    name: 'Beban Pokok',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Cost Of Sales',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
  {
    coaId: '6100',
    parentId: '0',
    code: '6-1000',
    name: 'Beban Operasional',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
  {
    coaId: '8100',
    parentId: '0',
    code: '8-1000',
    name: 'Beban Bunga',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Other Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
]

describe('expense-paid pure calculations', () => {
  it('excludes asset debt bill payments (itemType 3)', () => {
    const tree = buildCoaTree(mockCoa)
    const vendorNames = new Map([['v1', { code: 'V1', name: 'Vendor 1' }]])

    const allocated = [
      {
        cardId: 'c1',
        locationId: 'loc1',
        vendorId: 'v1',
        itemType: 0, // General bill
        detailSum: '1000.00',
      },
      {
        cardId: 'c2',
        locationId: 'loc1',
        vendorId: 'v1',
        itemType: 3, // Asset debt (must be excluded!)
        detailSum: '5000.00',
      },
    ]

    const res = computeExpensePaidBreakdown({
      allocated,
      unallocated: [],
      direct: [],
      vendorNames,
      tree,
    })

    expect(res.apPayments).toBe('1000.00')
    expect(res.total).toBe('1000.00')
  })

  it('includes unallocated payment cards and calculates unallocatedPayments', () => {
    const tree = buildCoaTree(mockCoa)
    const vendorNames = new Map([['v1', { code: 'V1', name: 'Vendor 1' }]])

    // Card with amount 500 and in_out -1 -> signedAmount = -500.00
    const unallocated = [
      {
        cardId: 'c3',
        locationId: 'loc1',
        vendorId: 'v1',
        signedAmount: '-500.00',
      },
    ]

    const res = computeExpensePaidBreakdown({
      allocated: [],
      unallocated,
      direct: [],
      vendorNames,
      tree,
    })

    expect(res.unallocatedPayments).toBe('500.00')
    expect(res.total).toBe('500.00')
  })

  it('includes direct expense/cogs payments and ignores other expense / loan principal', () => {
    const tree = buildCoaTree(mockCoa)
    const vendorNames = new Map()

    const direct = [
      // Petty cash expense payment: -150.00 to Beban Operasional (Expense)
      {
        counterCoaId: '6100',
        accountGroup: 'Expense',
        portion: '-150.00',
      },
      // Loan interest: -50.00 to Other Expense (ignored!)
      {
        counterCoaId: '8100',
        accountGroup: 'Other Expense',
        portion: '-50.00',
      },
      // Loan principal: -1000.00 to Long Term Liabilities (ignored!)
      {
        counterCoaId: '2100',
        accountGroup: 'Long Term Liabilities',
        portion: '-1000.00',
      },
    ]

    const res = computeExpensePaidBreakdown({
      allocated: [],
      unallocated: [],
      direct,
      vendorNames,
      tree,
    })

    expect(res.directPayments).toBe('150.00')
    expect(res.total).toBe('150.00')
  })
})
