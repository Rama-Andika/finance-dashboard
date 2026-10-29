import { describe, expect, it } from 'vitest'
import { buildPnl, findOciCoaIds } from './pnl'
import { buildCoaTree, type CoaRow } from './coa-tree'

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
  // 9 OCI: the root HEADER has code '9'; OCI = its subtree (codes are not structural, §4.3)
  {
    coaId: '9000',
    parentId: '0',
    code: '9',
    name: 'OCI',
    status: 'HEADER',
    level: 1,
    accountGroup: 'Other Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  {
    coaId: '9110',
    parentId: '9000',
    code: '9-1100',
    name: 'Keuntungan Selisih Kurs Valas OCI',
    status: 'POSTABLE',
    level: 2,
    accountGroup: 'Other Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
]

describe('pnl calculations', () => {
  it('correctly calculates comprehensive income and separates OCI from Net Profit', () => {
    const tree = buildCoaTree(mockPnlRows)
    const ociCoaIds = findOciCoaIds(tree, ['9'])
    expect(ociCoaIds.has('9110')).toBe(true)
    // A code that merely starts with "9" outside the subtree is not OCI
    expect(findOciCoaIds(buildCoaTree([...mockPnlRows, { ...mockPnlRows[0]!, coaId: '9990', code: '99-00', parentId: '0' }]), ['9']).has('9990')).toBe(false)

    // Complete fixture:
    // Revenue 1000, COGS 600, OPEX 200, OtherRev 50, OtherExp 30, OCI 20
    const movements = [
      { coaId: '4110', periodId: 'p1', debet: '0.00', credit: '1000.00' },
      { coaId: '5110', periodId: 'p1', debet: '600.00', credit: '0.00' },
      { coaId: '6110', periodId: 'p1', debet: '200.00', credit: '0.00' },
      { coaId: '7110', periodId: 'p1', debet: '0.00', credit: '50.00' },
      { coaId: '8110', periodId: 'p1', debet: '30.00', credit: '0.00' },
      { coaId: '9110', periodId: 'p1', debet: '0.00', credit: '20.00' },
    ]

    const { lines } = buildPnl({ tree, movements, ociCoaIds })
    const lineMap = new Map(lines.map((l) => [l.key, l]))

    expect(lineMap.get('revenue')?.amount).toBe('1000.00')
    expect(lineMap.get('cogs')?.amount).toBe('600.00')
    expect(lineMap.get('grossProfit')?.amount).toBe('400.00')
    expect(lineMap.get('grossProfit')?.margin).toBe('40.0%') // 400 / 1000
    expect(lineMap.get('opex')?.amount).toBe('200.00')
    expect(lineMap.get('operatingProfit')?.amount).toBe('200.00')
    expect(lineMap.get('operatingProfit')?.margin).toBe('20.0%') // 200 / 1000
    expect(lineMap.get('otherRevenue')?.amount).toBe('50.00')
    expect(lineMap.get('otherExpense')?.amount).toBe('30.00')
    expect(lineMap.get('netProfit')?.amount).toBe('220.00')
    expect(lineMap.get('netProfit')?.margin).toBe('22.0%') // 220 / 1000
    expect(lineMap.get('oci')?.amount).toBe('20.00')
    expect(lineMap.get('comprehensiveIncome')?.amount).toBe('240.00')
  })

  it('handles zero revenue with null margins', () => {
    const tree = buildCoaTree(mockPnlRows)
    const ociCoaIds = findOciCoaIds(tree, ['9'])

    const movements = [
      { coaId: '6110', periodId: 'p1', debet: '200.00', credit: '0.00' },
    ]

    const { lines } = buildPnl({ tree, movements, ociCoaIds })
    const lineMap = new Map(lines.map((l) => [l.key, l]))

    expect(lineMap.get('revenue')?.amount).toBe('0.00')
    expect(lineMap.get('grossProfit')?.margin).toBeNull()
    expect(lineMap.get('operatingProfit')?.margin).toBeNull()
    expect(lineMap.get('netProfit')?.margin).toBeNull()
  })
})
