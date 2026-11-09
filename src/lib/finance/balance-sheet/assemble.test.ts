import { describe, expect, it } from 'vitest'
import { balanceSheetCoaRows, monthsBetween, period13Of, regularPeriod } from 'tests/fixtures/balance-sheet.fixture'
import { buildCoaTree } from '../coa/coa-tree'
import { pickOpeningPeriod } from '../period/balance'
import { assembleBalances, extraLinesOf, planBalance } from './assemble'
import { resolveEarningsAccounts } from './earnings'
import { buildBalanceSheet } from './statement'
import type { BalanceTarget } from './targets'
import type { Id, Money, Period } from '../../core/types'

const tree = buildCoaTree(balanceSheetCoaRows)
const earningsAccounts = resolveEarningsAccounts(tree, { current: '33', prior: '32' })

type Move = { coaId: Id; periodId: Id; debet: Money; credit: Money }

/** Cash sales and cash rent of one month, as the journals of that month would add them up. */
function monthMovements(periodId: Id, sales: number, rent: number): Move[] {
  return [
    { coaId: 'cash', periodId, debet: sales.toFixed(2), credit: rent.toFixed(2) },
    { coaId: 'sales', periodId, debet: '0.00', credit: sales.toFixed(2) },
    { coaId: 'rent', periodId, debet: rent.toFixed(2), credit: '0.00' },
  ]
}

/**
 * The service's steps without the database: P* from pickOpeningPeriod, the plans, the assembly and the statement.
 * `openings` are the opening balances saved for P*.
 */
function run(input: {
  periods: Period[]
  target: BalanceTarget
  openings: Array<{ coaId: Id; opening: Money }>
  movements: Move[]
  openingExists?: boolean
}) {
  const { opening } = pickOpeningPeriod(input.periods, input.target.period.startDate)
  const plan = planBalance({
    periods: input.periods,
    target: input.target,
    openingPeriod: opening,
    openingExists: input.openingExists ?? true,
    fiscalEndMonth: 12,
  })
  const assembled = assembleBalances({
    tree,
    plan,
    earningsAccounts,
    openings: input.openings,
    movements: input.movements,
  })
  const statement = buildBalanceSheet({
    tree,
    balances: assembled.balances,
    compareBalances: null,
    extraLines: extraLinesOf(assembled, null),
  })
  return { plan, assembled, statement }
}

describe('assembleBalances: a worked example', () => {
  // The year starts with cash 190, capital 150 and prior earnings 40. January earns 30, February 20, March 10.
  const periods = [regularPeriod('2026-01'), regularPeriod('2026-02'), regularPeriod('2026-03', 'Open')]
  const target = { period: regularPeriod('2026-03', 'Open'), p13: null }
  const movements = [
    ...monthMovements('r2026-01', 100, 70),
    ...monthMovements('r2026-02', 80, 60),
    ...monthMovements('r2026-03', 50, 40),
  ]

  it('opening-table: the sides balance and the earnings line is the profit of the year so far', () => {
    // February is Closed, so March has saved opening balances: cash 240, capital 150, prior 40, earnings 50 (Jan + Feb).
    const { plan, assembled, statement } = run({
      periods,
      target,
      openings: [
        { coaId: 'cash', opening: '240.00' },
        { coaId: 'capital', opening: '150.00' },
        { coaId: 'prior', opening: '40.00' },
        { coaId: 'current', opening: '50.00' },
      ],
      movements,
    })
    expect(plan.plan.method).toBe('opening-table')
    expect(assembled.balances.get('cash')).toBe('250.00')
    expect(assembled.balances.get('current')).toBe('60.00')
    expect(assembled.earnings).toMatchObject({ used: 'A', methodA: '60.00', methodB: '60.00', difference: '0.00' })
    expect(statement.totals).toMatchObject({ assets: '250.00', liabilitiesEquity: '250.00', difference: '0.00' })
  })

  it('bridge: February is not closed yet, so the sum starts from the opening of February', () => {
    const bridgePeriods = [
      regularPeriod('2026-01'),
      regularPeriod('2026-02', 'Pre Closed'),
      regularPeriod('2026-03', 'Open'),
    ]
    // The opening balances of February: cash 220, capital 150, prior 40, earnings 30 (January).
    const { plan, assembled, statement } = run({
      periods: bridgePeriods,
      target,
      openings: [
        { coaId: 'cash', opening: '220.00' },
        { coaId: 'capital', opening: '150.00' },
        { coaId: 'prior', opening: '40.00' },
        { coaId: 'current', opening: '30.00' },
      ],
      movements,
    })
    expect(plan.plan.method).toBe('bridge')
    expect(plan.plan.openingPeriod?.periodeId).toBe('r2026-02')
    expect(assembled.balances.get('cash')).toBe('250.00')
    expect(assembled.balances.get('current')).toBe('60.00')
    expect(statement.totals.difference).toBe('0.00')
  })

  it('full-history: no opening balances, so every journal is added up', () => {
    const initial: Move[] = [
      { coaId: 'cash', periodId: 'r2026-01', debet: '190.00', credit: '0.00' },
      { coaId: 'capital', periodId: 'r2026-01', debet: '0.00', credit: '150.00' },
      { coaId: 'prior', periodId: 'r2026-01', debet: '0.00', credit: '40.00' },
    ]
    const { plan, assembled, statement } = run({
      periods: [regularPeriod('2026-01', 'Open'), regularPeriod('2026-02', 'Open'), regularPeriod('2026-03', 'Open')],
      target,
      openings: [],
      openingExists: false,
      movements: [...initial, ...movements],
    })
    expect(plan.plan.method).toBe('full-history')
    expect(assembled.earnings.used).toBe('B')
    expect(assembled.balances.get('current')).toBe('60.00')
    expect(statement.totals).toMatchObject({ assets: '250.00', difference: '0.00' })
  })

  it('shows the difference when the ERP opening balance of the earnings account is wrong', () => {
    const { assembled, statement } = run({
      periods,
      target,
      openings: [
        { coaId: 'cash', opening: '240.00' },
        { coaId: 'capital', opening: '150.00' },
        { coaId: 'prior', opening: '40.00' },
        { coaId: 'current', opening: '45.00' },
      ],
      movements,
    })
    expect(assembled.earnings.difference).toBe('-5.00')
    expect(statement.totals.difference).toBe('5.00')
  })

  it('adds the period 13 only when the target includes it', () => {
    const december = regularPeriod('2025-12')
    const p13 = period13Of(2025)
    const decPeriods = [regularPeriod('2025-11'), december, p13]
    const decMovements = [
      ...monthMovements('r2025-12', 100, 70),
      // an adjustment booked in period 13: 10 less cash sales
      { coaId: 'cash', periodId: 'p13-2025', debet: '0.00', credit: '10.00' },
      { coaId: 'sales', periodId: 'p13-2025', debet: '10.00', credit: '0.00' },
    ]
    const openings = [
      { coaId: 'cash', opening: '500.00' },
      { coaId: 'capital', opening: '400.00' },
      { coaId: 'prior', opening: '0.00' },
      { coaId: 'current', opening: '100.00' },
    ]
    const without = run({
      periods: decPeriods,
      target: { period: december, p13: null },
      openings,
      movements: decMovements,
    })
    const withP13 = run({ periods: decPeriods, target: { period: december, p13 }, openings, movements: decMovements })
    expect(without.assembled.balances.get('cash')).toBe('530.00')
    expect(without.assembled.balances.get('current')).toBe('130.00')
    expect(withP13.assembled.balances.get('cash')).toBe('520.00')
    expect(withP13.assembled.balances.get('current')).toBe('120.00')
    expect(without.statement.totals.difference).toBe('0.00')
    expect(withP13.statement.totals.difference).toBe('0.00')
  })
})

describe('assembleBalances: every way of closing the books keeps the sides balanced', () => {
  // 15 months, calendar fiscal year. Cash starts with a capital payment of 1000 in January 2025.
  const months = monthsBetween('2025-01', '2026-03').map((p) => p.periodeId.slice(1))
  const sales = months.map((_, i) => 100 + i * 7)
  const rent = months.map((_, i) => 60 + i * 3)
  const profit = months.map((_, i) => sales[i]! - rent[i]!)

  const allMovements: Move[] = months.flatMap((month, i) => {
    const rows = monthMovements(`r${month}`, sales[i]!, rent[i]!)
    return i === 0
      ? [
          ...rows,
          { coaId: 'cash', periodId: `r${month}`, debet: '1000.00', credit: '0.00' },
          { coaId: 'capital', periodId: `r${month}`, debet: '0.00', credit: '1000.00' },
        ]
      : rows
  })

  const total = (from: number, to: number) => profit.slice(from, to + 1).reduce((acc, v) => acc + v, 0)

  /** The opening balances the ERP saves for month `k` (the start of month k), as its month-end closing writes them. */
  function openingsAt(k: number) {
    const cash = 1000 + total(0, k - 1)
    const isJanuary = months[k]!.endsWith('-01')
    const januaryOfYear = isJanuary ? k : months.findIndex((m) => m.startsWith(months[k]!.slice(0, 4)))
    const current = isJanuary ? 0 : total(januaryOfYear, k - 1)
    const prior = januaryOfYear > 0 ? total(0, januaryOfYear - 1) : 0
    return [
      { coaId: 'cash', opening: cash.toFixed(2) },
      { coaId: 'capital', opening: '1000.00' },
      { coaId: 'prior', opening: prior.toFixed(2) },
      { coaId: 'current', opening: current.toFixed(2) },
    ]
  }

  for (let t = 0; t < months.length; t += 1) {
    for (let lastClosed = -1; lastClosed < t; lastClosed += 1) {
      it(`target ${months[t]}, closed up to ${lastClosed < 0 ? 'nothing' : months[lastClosed]}`, () => {
        const periods: Period[] = months.slice(0, t + 1).map((month, i) => {
          const status = i <= lastClosed ? 'Closed' : i === t ? 'Open' : 'Pre Closed'
          return regularPeriod(month, status)
        })
        const target = { period: periods[t]!, p13: null }
        // Opening balances exist for the month after the last Closed one (its previous month was closed).
        const openingMonth = lastClosed + 1
        const hasOpening = lastClosed >= 0
        const result = run({
          periods,
          target,
          openings: hasOpening ? openingsAt(openingMonth) : [],
          openingExists: hasOpening,
          movements: allMovements,
        })

        const januaryOfTarget = months.findIndex((m) => m.startsWith(months[t]!.slice(0, 4)))
        const ytd = total(januaryOfTarget, t)
        const earlierYears = januaryOfTarget > 0 ? total(0, januaryOfTarget - 1) : 0
        expect(result.statement.totals.difference).toBe('0.00')
        expect(result.assembled.balances.get('current')).toBe(ytd.toFixed(2))
        expect(result.assembled.balances.get('prior')).toBe(earlierYears.toFixed(2))
        expect(result.assembled.balances.get('cash')).toBe((1000 + total(0, t)).toFixed(2))
      })
    }
  }
})

describe('extraLinesOf', () => {
  const unresolved = resolveEarningsAccounts(tree, { current: null, prior: null })

  function assembleWithoutAccounts(profitAmount: number) {
    const periods = [regularPeriod('2026-01', 'Open')]
    const target = { period: periods[0]!, p13: null }
    const plan = planBalance({ periods, target, openingPeriod: periods[0]!, openingExists: false, fiscalEndMonth: 12 })
    return assembleBalances({
      tree,
      plan,
      earningsAccounts: unresolved,
      openings: [],
      movements: monthMovements('r2026-01', profitAmount, 0),
    })
  }

  it('adds a current earnings line holding the profit when the account was not found', () => {
    const assembled = assembleWithoutAccounts(30)
    expect(assembled.unplaced.current).toBe('30.00')
    expect(extraLinesOf(assembled, null)).toEqual([
      { id: '__current_year_earnings__', labelKey: 'currentYearEarnings', amount: '30.00', compare: null },
    ])
  })

  it('adds a prior earnings line only when it has an amount', () => {
    const assembled = assembleWithoutAccounts(30)
    expect(extraLinesOf(assembled, null).map((l) => l.id)).not.toContain('__prior_years_earnings__')
    const withPrior = { ...assembled, unplaced: { current: '30.00', prior: '9.00' } }
    expect(extraLinesOf(withPrior, null).map((l) => l.id)).toContain('__prior_years_earnings__')
  })

  it('gives each line the comparison amount', () => {
    const primary = assembleWithoutAccounts(30)
    const compare = assembleWithoutAccounts(12)
    expect(extraLinesOf(primary, compare)[0]).toMatchObject({ amount: '30.00', compare: '12.00' })
  })

  it('has no extra lines when both accounts were found', () => {
    const periods = [regularPeriod('2026-01', 'Open')]
    const target = { period: periods[0]!, p13: null }
    const plan = planBalance({ periods, target, openingPeriod: periods[0]!, openingExists: false, fiscalEndMonth: 12 })
    const assembled = assembleBalances({ tree, plan, earningsAccounts, openings: [], movements: [] })
    expect(extraLinesOf(assembled, null)).toEqual([])
  })
})
