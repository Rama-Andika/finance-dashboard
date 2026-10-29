import { describe, expect, it } from 'vitest'
import { computeFixedCost } from './fixed-cost'
import { buildCoaTree, type CoaRow } from './coa-tree'

const mockCoa: CoaRow[] = [
  {
    coaId: '6110',
    parentId: '0',
    code: '6-1100',
    name: 'Gaji Karyawan Tetap',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
  {
    coaId: '6120',
    parentId: '0',
    code: '6-1200',
    name: 'Sewa Gedung Kantor',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
  {
    coaId: '6210',
    parentId: '0',
    code: '6-2100',
    name: 'Komisi Penjualan (Variabel)',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
]

describe('fixed cost pure calculations', () => {
  const tree = buildCoaTree(mockCoa)

  it('separates fixed cost accounts from variable expense and calculates average', () => {
    // 6110 and 6120 are in fixedCost basket. 6210 is variable expense.
    const fixedCoaIds = new Set(['6110', '6120'])
    const expenseCoaIds = new Set(['6110', '6120', '6210'])

    const movements = [
      // Month 1 (p1)
      { coaId: '6110', periodId: 'p1', debet: '500.00', credit: '0.00' },
      { coaId: '6120', periodId: 'p1', debet: '300.00', credit: '0.00' },
      { coaId: '6210', periodId: 'p1', debet: '200.00', credit: '0.00' },

      // Month 2 (p2)
      { coaId: '6110', periodId: 'p2', debet: '500.00', credit: '0.00' },
      { coaId: '6120', periodId: 'p2', debet: '300.00', credit: '0.00' },
      { coaId: '6210', periodId: 'p2', debet: '400.00', credit: '0.00' },
    ]

    const months = [
      { month: '2026-09', periodIds: ['p1'] },
      { month: '2026-10', periodIds: ['p2'] },
    ]

    const res = computeFixedCost({
      fixedCoaIds,
      expenseCoaIds,
      movements,
      months,
      tree,
    })

    expect(res.basketEmpty).toBe(false)
    expect(res.months).toHaveLength(2)

    // Month 1: fixed = 500 + 300 = 800.00, variable = 200.00
    expect(res.months[0]?.fixed).toBe('800.00')
    expect(res.months[0]?.variable).toBe('200.00')

    // Month 2: fixed = 500 + 300 = 800.00, variable = 400.00
    expect(res.months[1]?.fixed).toBe('800.00')
    expect(res.months[1]?.variable).toBe('400.00')

    // Average fixed = (800 + 800) / 2 = 800.00
    expect(res.averageFixed).toBe('800.00')

    // Breakdown includes 2 accounts
    expect(res.byFolder).toHaveLength(1)
    expect(res.byFolder[0]?.amount).toBe('1600.00')
    expect(res.byFolder[0]?.children).toHaveLength(2)
  })

  it('handles empty fixed cost basket correctly', () => {
    const res = computeFixedCost({
      fixedCoaIds: new Set(),
      expenseCoaIds: new Set(['6110']),
      movements: [],
      months: [{ month: '2026-10', periodIds: ['p1'] }],
      tree,
    })

    expect(res.basketEmpty).toBe(true)
    expect(res.averageFixed).toBe('0.00')
    expect(res.byFolder).toHaveLength(0)
  })
})
