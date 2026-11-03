import { describe, expect, it } from 'vitest'
import {
  actualByCoaOf,
  budgetByCoaOf,
  budgetYearMonths,
  monthToMonth0,
  isHigherBetter,
  computeVariance,
  buildBudgetTree,
  summarizeBudget,
} from './budget'
import { buildCoaTree, type CoaRow } from '../coa/coa-tree'
import type { AccountGroup } from '../../core/types'

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
  it('converts month to 0-indexed month', () => {
    // October = month 10 -> 0-indexed 9
    expect(monthToMonth0(10)).toBe(9)
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

describe('budget service pieces', () => {
  const groups = new Map<string, AccountGroup>([
    ['rev', 'Revenue'],
    ['exp', 'Expense'],
  ])

  it('signs the actual amounts by group, adds them exactly and rounds once', () => {
    const actual = actualByCoaOf(
      [
        { coaId: 'rev', debet: '0', credit: '100.004' },
        { coaId: 'rev', debet: '0', credit: '100.004' },
        { coaId: 'exp', debet: '30', credit: '5' },
        { coaId: 'unknown', debet: '8', credit: '0' },
      ],
      groups,
    )
    expect(actual.get('rev')).toBe('200.01')
    expect(actual.get('exp')).toBe('25.00')
    // an account without a known group counts as an expense (debit side)
    expect(actual.get('unknown')).toBe('8.00')
  })

  it('adds the budget rows per account', () => {
    const budget = budgetByCoaOf([
      { coaId: 'a', amount: '10.50' },
      { coaId: 'a', amount: '4.50' },
      { coaId: 'b', amount: '1' },
    ])
    expect(budget.get('a')).toBe('15.00')
    expect(budget.get('b')).toBe('1.00')
  })

  it('groups the months by year with 0-based months and skips bad keys', () => {
    expect(budgetYearMonths(['2025-11', '2025-12', '2026-01', '2025-11', 'bad', '2026-00'])).toEqual([
      { year: 2025, months0: [10, 11] },
      { year: 2026, months0: [0] },
    ])
    expect(budgetYearMonths([])).toEqual([])
  })

  it('totals the net profit: income groups minus costs and expenses', () => {
    const total = summarizeBudget([
      { accountGroup: 'Revenue', actual: '100.00', budget: '90.00' },
      { accountGroup: 'Other Revenue', actual: '10.00', budget: '10.00' },
      { accountGroup: 'Cost Of Sales', actual: '40.00', budget: '30.00' },
      { accountGroup: 'Expense', actual: '20.00', budget: '25.00' },
    ])
    expect(total.actual.toFixed(2)).toBe('50.00')
    expect(total.budget.toFixed(2)).toBe('45.00')
  })
})
