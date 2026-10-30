import { describe, expect, it } from 'vitest'
import { buildPnl } from './pnl'
import { buildCoaTree, type CoaRow } from '../coa/coa-tree'

const mockPnlRows: CoaRow[] = [
  // 4 Revenue
  {
    coaId: '4110',
    parentId: '0',
    code: '4-1100',
    name: 'Penjualan',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  // 5 Cost Of Sales
  {
    coaId: '5110',
    parentId: '0',
    code: '5-1100',
    name: 'HPP Barang',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Cost Of Sales',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
  // 6 Expense
  {
    coaId: '6110',
    parentId: '0',
    code: '6-1100',
    name: 'Beban Gaji',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
  // 7 Other Revenue
  {
    coaId: '7110',
    parentId: '0',
    code: '7-1100',
    name: 'Pendapatan Bunga',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Other Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  // 8 Other Expense
  {
    coaId: '8110',
    parentId: '0',
    code: '8-1100',
    name: 'Beban Bunga Pinjaman',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Other Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
]

describe('pnl calculations', () => {
  it('calculates the profit lines and margins', () => {
    const tree = buildCoaTree(mockPnlRows)

    // Complete fixture:
    // Revenue 1000, COGS 600, OPEX 200, OtherRev 50, OtherExp 30
    const movements = [
      { coaId: '4110', periodId: 'p1', debet: '0.00', credit: '1000.00' },
      { coaId: '5110', periodId: 'p1', debet: '600.00', credit: '0.00' },
      { coaId: '6110', periodId: 'p1', debet: '200.00', credit: '0.00' },
      { coaId: '7110', periodId: 'p1', debet: '0.00', credit: '50.00' },
      { coaId: '8110', periodId: 'p1', debet: '30.00', credit: '0.00' },
    ]

    const { lines } = buildPnl({ tree, movements })
    const lineMap = new Map(lines.map((l) => [l.key, l]))

    expect(lineMap.get('revenue')?.amount).toBe('1000.00')
    expect(lineMap.get('cogs')?.amount).toBe('600.00')
    expect(lineMap.get('grossProfit')?.amount).toBe('400.00')
    expect(lineMap.get('grossProfit')?.margin).toBe('0.4') // 400 / 1000
    expect(lineMap.get('opex')?.amount).toBe('200.00')
    expect(lineMap.get('operatingProfit')?.amount).toBe('200.00')
    expect(lineMap.get('operatingProfit')?.margin).toBe('0.2') // 200 / 1000
    expect(lineMap.get('otherRevenue')?.amount).toBe('50.00')
    expect(lineMap.get('otherExpense')?.amount).toBe('30.00')
    expect(lineMap.get('netProfit')?.amount).toBe('220.00')
    expect(lineMap.get('netProfit')?.margin).toBe('0.22') // 220 / 1000
  })

  it('handles zero revenue with null margins', () => {
    const tree = buildCoaTree(mockPnlRows)

    const movements = [
      { coaId: '6110', periodId: 'p1', debet: '200.00', credit: '0.00' },
    ]

    const { lines } = buildPnl({ tree, movements })
    const lineMap = new Map(lines.map((l) => [l.key, l]))

    expect(lineMap.get('revenue')?.amount).toBe('0.00')
    expect(lineMap.get('grossProfit')?.margin).toBeNull()
    expect(lineMap.get('operatingProfit')?.margin).toBeNull()
    expect(lineMap.get('netProfit')?.margin).toBeNull()
  })
})
