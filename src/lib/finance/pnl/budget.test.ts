import { describe, expect, it } from 'vitest'
import {
  monthToMonth0,
  ytdMonths0,
  isHigherBetter,
  computeVariance,
  buildBudgetTree,
} from './budget'
import { buildCoaTree, type CoaRow } from '../coa/coa-tree'

const mockCoa: CoaRow[] = [
  {
    coaId: '4110',
    parentId: '0',
    code: '4-1100',
    name: 'Penjualan Retail',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Revenue',
    subAccountGroup: '',
    saldoNormal: 'CREDIT',
  },
  {
    coaId: '6110',
    parentId: '0',
    code: '6-1100',
    name: 'Beban Operasional',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Expense',
    subAccountGroup: '',
    saldoNormal: 'DEBET',
  },
]

describe('budget vs actual pure logic', () => {
  it('converts month to 0-indexed month and generates YTD sequence', () => {
    // October = month 10 -> 0-indexed 9
    expect(monthToMonth0(10)).toBe(9)

    // YTD October -> [0, 1, ..., 9] (10 months)
    const ytd = ytdMonths0(9)
    expect(ytd).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(ytd).toHaveLength(10)
  })

  it('determines higherIsBetter direction for Revenue vs Expense', () => {
    expect(isHigherBetter('Revenue')).toBe(true)
    expect(isHigherBetter('Other Revenue')).toBe(true)
    expect(isHigherBetter('Expense')).toBe(false)
    expect(isHigherBetter('Cost Of Sales')).toBe(false)
    expect(isHigherBetter('Other Expense')).toBe(false)
  })

  it('computes variance and returns null for variancePercent when budget is zero', () => {
    // Actual 120, Budget 100 -> +20, +20.0%
    const res1 = computeVariance('120.00', '100.00')
    expect(res1.variance).toBe('20.00')
    expect(res1.variancePercent).toBe('20.0%')

    // Actual 50, Budget 0 -> +50, null
    const res2 = computeVariance('50.00', '0.00')
    expect(res2.variance).toBe('50.00')
    expect(res2.variancePercent).toBeNull()
  })

  it('builds budget tree with correct aggregation and color direction', () => {
    const tree = buildCoaTree(mockCoa)

    const actualByCoa = new Map([
      ['4110', '1200.00'], // Revenue actual
      ['6110', '800.00'],  // Expense actual
    ])

    const budgetByCoa = new Map([
      ['4110', '1000.00'], // Revenue budget
      ['6110', '900.00'],  // Expense budget
    ])

    const rows = buildBudgetTree({
      tree,
      accountGroups: ['Revenue', 'Expense'],
      actualByCoa,
      budgetByCoa,
    })

    expect(rows).toHaveLength(2)

    // Revenue
    const revGroup = rows[0]!
    expect(revGroup.name).toBe('Revenue')
    expect(revGroup.higherIsBetter).toBe(true)
    expect(revGroup.actual).toBe('1200.00')
    expect(revGroup.budget).toBe('1000.00')
    expect(revGroup.variance).toBe('200.00')
    expect(revGroup.variancePercent).toBe('20.0%')

    // Expense
    const expGroup = rows[1]!
    expect(expGroup.name).toBe('Expense')
    expect(expGroup.higherIsBetter).toBe(false)
    expect(expGroup.actual).toBe('800.00')
    expect(expGroup.budget).toBe('900.00')
    expect(expGroup.variance).toBe('-100.00')
    expect(expGroup.variancePercent).toBe('-11.1%')
  })
})
