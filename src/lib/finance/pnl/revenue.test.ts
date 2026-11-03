import { describe, expect, it } from 'vitest'
import {
  aggregateRevenue,
  buildRevenueBreakdown,
  computeNetRevenue,
  groupFolders,
  movementsByCoaOf,
  revenueTrend,
  splitRevenueByEntity,
  sumNetRevenue,
} from './revenue'
import { buildCoaTree, type CoaRow } from '../coa/coa-tree'

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

describe('revenue aggregation', () => {
  const rows = [
    { coaId: 'a', periodId: 'p1', locationId: 'L1', debet: '10.00', credit: '110.00' },
    { coaId: 'a', periodId: 'p2', locationId: 'L1', debet: '0.00', credit: '50.00' },
    { coaId: 'b', periodId: 'p2', locationId: 'L2', debet: '5.00', credit: '25.00' },
    { coaId: 'b', periodId: null, locationId: null, debet: '0.00', credit: '7.00' },
  ]

  it('adds up the net revenue in total and per account, period and location', () => {
    const agg = aggregateRevenue(rows)
    expect(agg.total.toFixed(2)).toBe('177.00')
    expect(agg.byCoa.get('a')?.credit.toFixed(2)).toBe('160.00')
    expect(movementsByCoaOf(agg.byCoa).get('b')).toEqual({ debet: '5.00', credit: '32.00' })
    expect(agg.byPeriod.get('p2')?.toFixed(2)).toBe('70.00')
    expect(agg.byLocation.get('L1')?.toFixed(2)).toBe('150.00')
    expect(agg.byLocation.size).toBe(2)
  })

  it('does not round while adding up', () => {
    const agg = aggregateRevenue([
      { coaId: 'a', debet: '0', credit: '0.004' },
      { coaId: 'a', debet: '0', credit: '0.004' },
    ])
    expect(agg.byCoa.get('a')?.credit.toFixed(3)).toBe('0.008')
    expect(agg.total.toFixed(2)).toBe('0.01')
  })

  it('sums the net revenue of comparison rows', () => {
    expect(sumNetRevenue(rows).toFixed(2)).toBe('177.00')
    expect(sumNetRevenue([]).toFixed(2)).toBe('0.00')
  })

  it('builds the trend per month from the periods that start in it, and gives 0 to a month without data', () => {
    const agg = aggregateRevenue(rows)
    const periods = [
      { periodeId: 'p1', startDate: '2026-01-01' },
      { periodeId: 'p2', startDate: '2026-02-01' },
    ]
    expect(revenueTrend(agg.byPeriod, periods, ['2026-01', '2026-02', '2026-03'])).toEqual([
      { month: '2026-01', amount: '100.00' },
      { month: '2026-02', amount: '70.00' },
      { month: '2026-03', amount: '0.00' },
    ])
  })

  it('splits revenue per entity and keeps the rest as "no entity"', () => {
    const agg = aggregateRevenue(rows)
    const entities = [
      { locationId: 'L1', code: 'A', name: 'Entity A' },
      { locationId: 'L2', code: 'B', name: 'Entity B' },
      { locationId: 'L3', code: 'C', name: 'Entity C' },
    ]
    const split = splitRevenueByEntity(entities, agg.byLocation, agg.total)
    expect(split.byEntity.map((e) => [e.id, e.amount])).toEqual([
      ['L1', '150.00'],
      ['L2', '20.00'],
      ['L3', '0.00'],
    ])
    // 177 - (150 + 20 + 0): the 7.00 without a location
    expect(split.entityUnassigned).toBe('7.00')
  })
})
