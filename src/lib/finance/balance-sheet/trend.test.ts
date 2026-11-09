import { describe, expect, it } from 'vitest'
import { balanceSheetCoaRows, monthsBetween, period13Of, regularPeriod } from 'tests/fixtures/balance-sheet.fixture'
import { buildCoaTree } from '../coa/coa-tree'
import {
  PROFIT_GROUP_KEY,
  TREND_MONTHS,
  cumulativeGroupAmounts,
  totalsOfGroupAmounts,
  trendPeriods,
  trendPoint,
} from './trend'
import type { Id, Money, Period } from '../../core/types'

const tree = buildCoaTree(balanceSheetCoaRows)

describe('trendPeriods', () => {
  const periods: Period[] = [...monthsBetween('2025-01', '2026-06'), period13Of(2025)]

  it('takes the 12 regular periods that end with the report period, oldest first', () => {
    const result = trendPeriods(periods, regularPeriod('2026-06'))
    expect(result).toHaveLength(TREND_MONTHS)
    expect(result[0]?.periodeId).toBe('r2025-07')
    expect(result.at(-1)?.periodeId).toBe('r2026-06')
  })

  it('leaves out later periods and the period 13', () => {
    const result = trendPeriods(periods, regularPeriod('2025-12'))
    expect(result.at(-1)?.periodeId).toBe('r2025-12')
    expect(result.map((p) => p.periodeId)).not.toContain('p13-2025')
  })

  it('gives fewer periods when there are not that many', () => {
    expect(trendPeriods(periods, regularPeriod('2025-03'))).toHaveLength(3)
  })
})

describe('totalsOfGroupAmounts', () => {
  const amounts = {
    'Liquid Assets': '200.00',
    'Fixed Assets': '100.00',
    'Other Assets': '0.00',
    'Current Liabilities': '80.00',
    'Long Term Liabilities': '20.00',
    Equity: '190.00',
    [PROFIT_GROUP_KEY]: '10.00',
  }

  it('adds the asset groups, the liability groups, and the equity group with the profit', () => {
    expect(totalsOfGroupAmounts(amounts)).toEqual({ assets: '300.00', liabilities: '100.00', equity: '200.00' })
  })

  it('treats a missing group as zero', () => {
    expect(totalsOfGroupAmounts({ 'Liquid Assets': '5.00' })).toEqual({
      assets: '5.00',
      liabilities: '0.00',
      equity: '0.00',
    })
  })
})

describe('trendPoint', () => {
  it('names the month and says whether the period is closed', () => {
    const closed = trendPoint(regularPeriod('2026-02'), { Equity: '1.00' }, 'snapshot')
    expect(closed).toMatchObject({
      periodId: 'r2026-02',
      monthKey: '2026-02',
      endDate: '2026-02-28',
      provisional: false,
      source: 'snapshot',
    })
    expect(trendPoint(regularPeriod('2026-03', 'Open'), {}, 'live')).toMatchObject({
      provisional: true,
      source: 'live',
    })
  })
})

describe('cumulativeGroupAmounts', () => {
  type Move = { coaId: Id; periodId: Id; debet: Money; credit: Money }
  const month = (periodId: Id, sales: string, rent: string): Move[] => [
    { coaId: 'cash', periodId, debet: sales, credit: rent },
    { coaId: 'sales', periodId, debet: '0.00', credit: sales },
    { coaId: 'rent', periodId, debet: rent, credit: '0.00' },
  ]
  // Opening balances of March: cash 240, capital 150, prior earnings 40, current earnings 50.
  const openings = [
    { coaId: 'cash', opening: '240.00' },
    { coaId: 'capital', opening: '150.00' },
    { coaId: 'prior', opening: '40.00' },
    { coaId: 'current', opening: '50.00' },
  ]
  const periods = [
    regularPeriod('2026-03', 'Pre Closed'),
    regularPeriod('2026-04', 'Pre Closed'),
    regularPeriod('2026-05', 'Open'),
  ]
  const movements = [
    ...month('r2026-03', '50.00', '40.00'),
    ...month('r2026-04', '30.00', '20.00'),
    ...month('r2026-05', '20.00', '5.00'),
  ]

  it('gives the amounts after every period, from one run over the movements', () => {
    const result = cumulativeGroupAmounts({
      tree,
      openings,
      movements,
      movementPeriods: periods,
      endStates: periods.map((p) => ({ periodId: p.periodeId, after: p.periodeId })),
    })
    expect(result.get('r2026-03')).toMatchObject({ 'Liquid Assets': '250.00', Equity: '240.00', Profit: '10.00' })
    expect(result.get('r2026-04')).toMatchObject({ 'Liquid Assets': '260.00', Equity: '240.00', Profit: '20.00' })
    expect(result.get('r2026-05')).toMatchObject({ 'Liquid Assets': '275.00', Equity: '240.00', Profit: '35.00' })
  })

  it('keeps the sides in balance at every month: equity with the profit equals the assets', () => {
    const result = cumulativeGroupAmounts({
      tree,
      openings,
      movements,
      movementPeriods: periods,
      endStates: periods.map((p) => ({ periodId: p.periodeId, after: p.periodeId })),
    })
    for (const p of periods) {
      const totals = totalsOfGroupAmounts(result.get(p.periodeId)!)
      expect(totals.assets).toBe(totals.equity)
    }
  })

  it('takes the amounts of the report month after its period 13 when that is asked for', () => {
    const p13 = period13Of(2025)
    const december = regularPeriod('2025-12', 'Pre Closed')
    const decMovements = [
      ...month('r2025-12', '100.00', '70.00'),
      { coaId: 'cash', periodId: 'p13-2025', debet: '0.00', credit: '10.00' },
      { coaId: 'sales', periodId: 'p13-2025', debet: '10.00', credit: '0.00' },
    ]
    const decOpenings = [
      { coaId: 'cash', opening: '500.00' },
      { coaId: 'capital', opening: '400.00' },
      { coaId: 'current', opening: '100.00' },
    ]
    const without = cumulativeGroupAmounts({
      tree,
      openings: decOpenings,
      movements: decMovements,
      movementPeriods: [december],
      endStates: [{ periodId: 'r2025-12', after: 'r2025-12' }],
    })
    const withP13 = cumulativeGroupAmounts({
      tree,
      openings: decOpenings,
      movements: decMovements,
      movementPeriods: [december, p13],
      endStates: [{ periodId: 'r2025-12', after: 'p13-2025' }],
    })
    expect(without.get('r2025-12')).toMatchObject({ 'Liquid Assets': '530.00', Profit: '30.00' })
    expect(withP13.get('r2025-12')).toMatchObject({ 'Liquid Assets': '520.00', Profit: '20.00' })
  })

  it('has no amounts for a period that was not asked for or that is not in the run', () => {
    const result = cumulativeGroupAmounts({
      tree,
      openings,
      movements,
      movementPeriods: periods,
      endStates: [
        { periodId: 'r2026-04', after: 'r2026-04' },
        { periodId: 'r2026-09', after: 'r2026-09' },
      ],
    })
    expect(Array.from(result.keys())).toEqual(['r2026-04'])
  })

  it('counts a contra account as a negative amount of its group and ignores unknown accounts', () => {
    const result = cumulativeGroupAmounts({
      tree,
      openings: [{ coaId: 'accdep', opening: '0.00' }],
      movements: [
        { coaId: 'accdep', periodId: 'r2026-03', debet: '0.00', credit: '20.00' },
        { coaId: 'unknown', periodId: 'r2026-03', debet: '5.00', credit: '0.00' },
      ],
      movementPeriods: [periods[0]!],
      endStates: [{ periodId: 'r2026-03', after: 'r2026-03' }],
    })
    expect(result.get('r2026-03')).toMatchObject({ 'Fixed Assets': '-20.00', Profit: '0.00' })
  })
})
