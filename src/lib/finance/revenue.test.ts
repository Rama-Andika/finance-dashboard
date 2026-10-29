import { describe, expect, it } from 'vitest'
import {
  computeNetRevenue,
  groupFolders,
  buildRevenueBreakdown,
} from './revenue'
import { buildCoaTree, type CoaRow } from './coa-tree'

const mockRevenueRows: CoaRow[] = [
  // 4 PENDAPATAN (Root HEADER, Revenue)
  {
    coaId: '4000',
    parentId: '0',
    code: '4-0000',
    name: 'PENDAPATAN',
    status: 'HEADER',
    level: 1,
    accountGroup: 'Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  // 4100 Pendapatan Usaha Retail (Folder under 4000)
  {
    coaId: '4100',
    parentId: '4000',
    code: '4-1000',
    name: 'Retail',
    status: 'HEADER',
    level: 2,
    accountGroup: 'Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  // 4110 Penjualan Toko A (POSTABLE under 4100)
  {
    coaId: '4110',
    parentId: '4100',
    code: '4-1100',
    name: 'Penjualan Toko A',
    status: 'POSTABLE',
    level: 3,
    accountGroup: 'Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  // 4200 Pendapatan Usaha Grosir (Folder under 4000)
  {
    coaId: '4200',
    parentId: '4000',
    code: '4-2000',
    name: 'Grosir',
    status: 'HEADER',
    level: 2,
    accountGroup: 'Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  // 4210 Penjualan Grosir (POSTABLE under 4200)
  {
    coaId: '4210',
    parentId: '4200',
    code: '4-2100',
    name: 'Penjualan Grosir',
    status: 'POSTABLE',
    level: 3,
    accountGroup: 'Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  // 7 Other Revenue (Not part of Revenue group!)
  {
    coaId: '7000',
    parentId: '0',
    code: '7-0000',
    name: 'PENDAPATAN LAIN',
    status: 'HEADER',
    level: 1,
    accountGroup: 'Other Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  {
    coaId: '7100',
    parentId: '7000',
    code: '7-1000',
    name: 'Pendapatan Bunga Bank',
    status: 'POSTABLE',
    level: 2,
    accountGroup: 'Other Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
]

describe('revenue calculations and folder grouping', () => {
  it('computes net revenue as credit minus debet', () => {
    // Credit 1000, debet return 100 -> 900.00
    const net = computeNetRevenue('100.00', '1000.00')
    expect(net).toBe('900.00')
  })

  it('identifies composition folders correctly for a group', () => {
    const tree = buildCoaTree(mockRevenueRows)
    const folders = groupFolders(tree, 'Revenue')

    expect(folders).toHaveLength(2)
    const names = folders.map((f) => f.name).sort()
    expect(names).toEqual(['Grosir', 'Retail'])
  })

  it('builds revenue breakdown hierarchy without other revenue accounts', () => {
    const tree = buildCoaTree(mockRevenueRows)
    const folders = groupFolders(tree, 'Revenue')

    const movements = new Map([
      ['4110', { debet: '100.00', credit: '1000.00' }], // Retail: net 900
      ['4210', { debet: '50.00', credit: '500.00' }],   // Grosir: net 450
      ['7100', { debet: '0.00', credit: '200.00' }],    // Other Revenue (ignored)
    ])

    const breakdown = buildRevenueBreakdown(tree, folders, movements)
    expect(breakdown).toHaveLength(2)

    const retail = breakdown.find((b) => b.label === 'Retail')!
    expect(retail.amount).toBe('900.00')
    expect(retail.children?.[0]!.amount).toBe('900.00')

    const grosir = breakdown.find((b) => b.label === 'Grosir')!
    expect(grosir.amount).toBe('450.00')
    expect(grosir.children?.[0]!.amount).toBe('450.00')
  })
})
