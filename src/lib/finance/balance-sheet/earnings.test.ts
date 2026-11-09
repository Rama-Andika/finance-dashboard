import { describe, expect, it } from 'vitest'
import { balanceSheetCoaRows, monthsBetween, period13Of, regularPeriod } from 'tests/fixtures/balance-sheet.fixture'
import { buildCoaTree } from '../coa/coa-tree'
import { pickOpeningPeriod } from '../period/balance'
import { computeEarnings, planEarnings, profitByPeriod, resolveEarningsAccounts } from './earnings'
import { planBalanceSources } from './sources'
import type { BalanceTarget } from './targets'
import type { AccountGroup, Id, Money, Period } from '../../core/types'

const ids = (periods: Period[]) => periods.map((p) => p.periodeId)

/** The sources plan and the earnings plan the way the service builds them. */
function plans(periods: Period[], target: BalanceTarget, openingExists = true, fiscalEndMonth = 12) {
  const { opening } = pickOpeningPeriod(periods, target.period.startDate)
  const plan = planBalanceSources({ periods, target, openingPeriod: opening, openingExists })
  return { plan, earningsPlan: planEarnings({ periods, target, plan, fiscalEndMonth }) }
}

describe('resolveEarningsAccounts', () => {
  const tree = buildCoaTree(balanceSheetCoaRows)

  it('finds both accounts by code', () => {
    expect(resolveEarningsAccounts(tree, { current: '33', prior: '32' })).toEqual({
      currentId: 'current',
      priorId: 'prior',
    })
  })

  it('trims the codes', () => {
    expect(resolveEarningsAccounts(tree, { current: ' 33 ', prior: '32\n' })).toEqual({
      currentId: 'current',
      priorId: 'prior',
    })
  })

  it('gives null for a missing property or an unknown code', () => {
    expect(resolveEarningsAccounts(tree, { current: null, prior: '999' })).toEqual({ currentId: null, priorId: null })
  })

  it('does not accept a header or a P&L account', () => {
    expect(resolveEarningsAccounts(tree, { current: '3', prior: '41' })).toEqual({ currentId: null, priorId: null })
  })

  it('leaves the prior account unresolved when both codes point to the same account', () => {
    expect(resolveEarningsAccounts(tree, { current: '33', prior: '33' })).toEqual({
      currentId: 'current',
      priorId: null,
    })
  })
})

describe('profitByPeriod', () => {
  const groups = new Map<Id, AccountGroup>([
    ['sales', 'Revenue'],
    ['interest', 'Other Revenue'],
    ['rent', 'Expense'],
    ['cogs', 'Cost Of Sales'],
    ['fee', 'Other Expense'],
    ['cash', 'Liquid Assets'],
  ])
  const groupOf = (id: Id) => groups.get(id)

  it('adds income and subtracts expense, per period', () => {
    const result = profitByPeriod(
      [
        { coaId: 'sales', periodId: 'p1', debet: '0.00', credit: '1000.00' },
        { coaId: 'interest', periodId: 'p1', debet: '0.00', credit: '50.00' },
        { coaId: 'rent', periodId: 'p1', debet: '300.00', credit: '0.00' },
        { coaId: 'cogs', periodId: 'p1', debet: '400.00', credit: '0.00' },
        { coaId: 'fee', periodId: 'p1', debet: '20.00', credit: '0.00' },
        { coaId: 'sales', periodId: 'p2', debet: '10.00', credit: '110.00' },
      ],
      groupOf,
    )
    expect(result.get('p1')).toBe('330.00')
    expect(result.get('p2')).toBe('100.00')
  })

  it('ignores balance sheet accounts, unknown accounts and rows without a period', () => {
    const result = profitByPeriod(
      [
        { coaId: 'cash', periodId: 'p1', debet: '500.00', credit: '0.00' },
        { coaId: 'unknown', periodId: 'p1', debet: '500.00', credit: '0.00' },
        { coaId: 'sales', debet: '0.00', credit: '500.00' },
      ],
      groupOf,
    )
    expect(result.size).toBe(0)
  })

  it('keeps cents exact', () => {
    const result = profitByPeriod(
      [
        { coaId: 'sales', periodId: 'p1', debet: '0.00', credit: '0.10' },
        { coaId: 'sales', periodId: 'p1', debet: '0.00', credit: '0.20' },
      ],
      groupOf,
    )
    expect(result.get('p1')).toBe('0.30')
  })
})

describe('planEarnings', () => {
  it('opening-table: this fiscal year to date is the current profit, nothing is prior', () => {
    const periods = monthsBetween('2026-01', '2026-03')
    const { earningsPlan } = plans(periods, { period: regularPeriod('2026-03'), p13: null })
    expect(earningsPlan.fyStart).toBe('2026-01-01')
    expect(ids(earningsPlan.currentPeriods)).toEqual(['r2026-01', 'r2026-02', 'r2026-03'])
    expect(earningsPlan.priorPeriods).toEqual([])
    expect(earningsPlan.aAvailable).toBe(true)
  })

  it('bridge inside the fiscal year keeps method A available', () => {
    const periods = [
      ...monthsBetween('2026-01', '2026-02'),
      regularPeriod('2026-03', 'Pre Closed'),
      regularPeriod('2026-04', 'Open'),
    ]
    const { plan, earningsPlan } = plans(periods, { period: regularPeriod('2026-04', 'Open'), p13: null })
    expect(plan.method).toBe('bridge')
    expect(earningsPlan.aAvailable).toBe(true)
    expect(earningsPlan.priorPeriods).toEqual([])
    expect(ids(earningsPlan.currentPeriods)).toEqual(['r2026-01', 'r2026-02', 'r2026-03', 'r2026-04'])
  })

  it('bridge across the fiscal year end: method A is off and the older year is prior', () => {
    const periods = [
      ...monthsBetween('2025-01', '2025-10'),
      regularPeriod('2025-11', 'Pre Closed'),
      regularPeriod('2025-12', 'Pre Closed'),
      period13Of(2025, 'Open'),
      regularPeriod('2026-01', 'Pre Closed'),
      regularPeriod('2026-02', 'Open'),
    ]
    const { plan, earningsPlan } = plans(periods, { period: regularPeriod('2026-02', 'Open'), p13: null })
    expect(plan.method).toBe('bridge')
    expect(plan.openingPeriod?.periodeId).toBe('r2025-11')
    expect(earningsPlan.aAvailable).toBe(false)
    expect(ids(earningsPlan.currentPeriods)).toEqual(['r2026-01', 'r2026-02'])
    expect(ids(earningsPlan.priorPeriods)).toEqual([
      ...monthsBetween('2025-01', '2025-11').map((p) => p.periodeId),
      'r2025-12',
      'p13-2025',
    ])
  })

  it('full-history: every earlier fiscal year is prior', () => {
    const periods = [
      ...monthsBetween('2025-11', '2025-12'),
      regularPeriod('2026-01', 'Open'),
      regularPeriod('2026-02', 'Open'),
    ]
    const { plan, earningsPlan } = plans(periods, { period: regularPeriod('2026-02', 'Open'), p13: null }, false)
    expect(plan.method).toBe('full-history')
    expect(earningsPlan.aAvailable).toBe(false)
    expect(ids(earningsPlan.currentPeriods)).toEqual(['r2026-01', 'r2026-02'])
    expect(ids(earningsPlan.priorPeriods)).toEqual(['r2025-11', 'r2025-12'])
  })

  it('counts the report period 13 in the current profit only when it is included', () => {
    const p13 = period13Of(2025)
    const periods = [...monthsBetween('2025-01', '2025-12'), p13]
    const december = regularPeriod('2025-12')
    const without = plans(periods, { period: december, p13: null }).earningsPlan
    const withP13 = plans(periods, { period: december, p13 }).earningsPlan
    expect(ids(without.currentPeriods)).not.toContain('p13-2025')
    expect(ids(withP13.currentPeriods)).toContain('p13-2025')
  })

  it('follows a fiscal year that ends in June', () => {
    const periods = monthsBetween('2025-07', '2026-02')
    const { earningsPlan } = plans(periods, { period: regularPeriod('2026-02'), p13: null }, true, 6)
    expect(earningsPlan.fyStart).toBe('2025-07-01')
    expect(earningsPlan.currentPeriods).toHaveLength(8)
  })
})

describe('computeEarnings', () => {
  const profit = (entries: Record<string, Money>) => new Map(Object.entries(entries))

  it('method A: opening balance of the earnings account plus the profit of the report period', () => {
    // January 30 and February 20 are already in the opening balance of March; March earns 10.
    const periods = monthsBetween('2026-01', '2026-03')
    const { plan, earningsPlan } = plans(periods, { period: regularPeriod('2026-03'), p13: null })
    const result = computeEarnings({
      earningsPlan,
      movementPeriods: plan.movementPeriods,
      profit: profit({ 'r2026-01': '30.00', 'r2026-02': '20.00', 'r2026-03': '10.00' }),
      accountOpening: '50.00',
      accountMovement: '0.00',
    })
    expect(result).toEqual({
      current: '60.00',
      priorAddition: '0.00',
      methodA: '60.00',
      methodB: '60.00',
      difference: '0.00',
      used: 'A',
    })
  })

  it('reports a difference and still uses method A when the ERP opening balance disagrees with the journals', () => {
    const periods = monthsBetween('2026-01', '2026-03')
    const { plan, earningsPlan } = plans(periods, { period: regularPeriod('2026-03'), p13: null })
    const result = computeEarnings({
      earningsPlan,
      movementPeriods: plan.movementPeriods,
      profit: profit({ 'r2026-01': '30.00', 'r2026-02': '20.00', 'r2026-03': '10.00' }),
      accountOpening: '45.00',
      accountMovement: '0.00',
    })
    expect(result.current).toBe('55.00')
    expect(result.methodB).toBe('60.00')
    expect(result.difference).toBe('-5.00')
    expect(result.used).toBe('A')
  })

  it('method A over a bridge inside the fiscal year', () => {
    const periods = [
      ...monthsBetween('2026-01', '2026-01'),
      regularPeriod('2026-02', 'Pre Closed'),
      regularPeriod('2026-03', 'Open'),
    ]
    const { plan, earningsPlan } = plans(periods, { period: regularPeriod('2026-03', 'Open'), p13: null })
    const result = computeEarnings({
      earningsPlan,
      movementPeriods: plan.movementPeriods,
      profit: profit({ 'r2026-01': '30.00', 'r2026-02': '20.00', 'r2026-03': '10.00' }),
      accountOpening: '30.00',
      accountMovement: '0.00',
    })
    expect(result.methodA).toBe('60.00')
    expect(result.methodB).toBe('60.00')
    expect(result.used).toBe('A')
  })

  it('method B across the fiscal year end: the older years go to the prior earnings line', () => {
    const periods = [
      ...monthsBetween('2025-01', '2025-10'),
      regularPeriod('2025-11', 'Pre Closed'),
      regularPeriod('2025-12', 'Pre Closed'),
      period13Of(2025, 'Open'),
      regularPeriod('2026-01', 'Pre Closed'),
      regularPeriod('2026-02', 'Open'),
    ]
    const { plan, earningsPlan } = plans(periods, { period: regularPeriod('2026-02', 'Open'), p13: null })
    const monthly: Record<string, Money> = {}
    for (const p of monthsBetween('2025-01', '2025-10')) monthly[p.periodeId] = '10.00'
    const result = computeEarnings({
      earningsPlan,
      movementPeriods: plan.movementPeriods,
      profit: profit({
        ...monthly,
        'r2025-11': '5.00',
        'r2025-12': '7.00',
        'p13-2025': '-1.00',
        'r2026-01': '3.00',
        'r2026-02': '4.00',
      }),
      accountOpening: '100.00',
      accountMovement: '0.00',
    })
    expect(result).toEqual({
      current: '7.00',
      priorAddition: '111.00',
      methodA: null,
      methodB: '7.00',
      difference: null,
      used: 'B',
    })
  })

  it('method B with full history', () => {
    const periods = [
      ...monthsBetween('2025-12', '2025-12'),
      regularPeriod('2026-01', 'Open'),
      regularPeriod('2026-02', 'Open'),
    ]
    const { plan, earningsPlan } = plans(periods, { period: regularPeriod('2026-02', 'Open'), p13: null }, false)
    const result = computeEarnings({
      earningsPlan,
      movementPeriods: plan.movementPeriods,
      profit: profit({ 'r2025-12': '9.00', 'r2026-01': '3.00', 'r2026-02': '4.00' }),
      accountOpening: '0.00',
      accountMovement: '0.00',
    })
    expect(result.used).toBe('B')
    expect(result.current).toBe('7.00')
    expect(result.priorAddition).toBe('9.00')
  })

  it('adds the own journal movements of the earnings account to both methods', () => {
    const periods = monthsBetween('2026-01', '2026-01')
    const { plan, earningsPlan } = plans(periods, { period: regularPeriod('2026-01'), p13: null })
    const result = computeEarnings({
      earningsPlan,
      movementPeriods: plan.movementPeriods,
      profit: profit({ 'r2026-01': '10.00' }),
      accountOpening: '0.00',
      accountMovement: '2.00',
    })
    expect(result.methodA).toBe('12.00')
    expect(result.methodB).toBe('12.00')
  })

  it('treats a period without profit as zero', () => {
    const periods = monthsBetween('2026-01', '2026-01')
    const { plan, earningsPlan } = plans(periods, { period: regularPeriod('2026-01'), p13: null })
    const result = computeEarnings({
      earningsPlan,
      movementPeriods: plan.movementPeriods,
      profit: new Map(),
      accountOpening: '5.00',
      accountMovement: '0.00',
    })
    expect(result.current).toBe('5.00')
    expect(result.methodB).toBe('0.00')
  })
})
