import { describe, expect, it } from 'vitest'
import { monthsBetween, period13Of, regularPeriod } from 'tests/fixtures/balance-sheet.fixture'
import { pickOpeningPeriod } from '../period/balance'
import { planBalanceSources } from './sources'
import type { BalanceTarget } from './targets'
import type { Period } from '../../core/types'

/** Plans the sources the way the service does: P* comes from pickOpeningPeriod, `openingExists` is given. */
function plan(periods: Period[], target: BalanceTarget, openingExists = true) {
  const { opening } = pickOpeningPeriod(periods, target.period.startDate)
  return planBalanceSources({ periods, target, openingPeriod: opening, openingExists })
}

const ids = (periods: Period[]) => periods.map((p) => p.periodeId)

describe('planBalanceSources', () => {
  it('opening-table: the previous period is Closed, so the report period has its own opening balances', () => {
    const periods = [...monthsBetween('2026-01', '2026-08'), regularPeriod('2026-09', 'Closed')]
    const result = plan(periods, { period: regularPeriod('2026-09', 'Closed'), p13: null })
    expect(result.method).toBe('opening-table')
    expect(result.openingPeriod?.periodeId).toBe('r2026-09')
    expect(ids(result.movementPeriods)).toEqual(['r2026-09'])
    expect(result.provisional).toBe(false)
    expect(result.unclosedCount).toBe(0)
  })

  it('opening-table for a Pre Closed report period whose previous period is Closed', () => {
    const periods = [...monthsBetween('2026-01', '2026-08'), regularPeriod('2026-09', 'Pre Closed')]
    const result = plan(periods, { period: regularPeriod('2026-09', 'Pre Closed'), p13: null })
    expect(result.method).toBe('opening-table')
    expect(result.provisional).toBe(true)
    expect(result.unclosedCount).toBe(1)
  })

  it('bridge: the last Closed period is two months back, so the sum starts from the opening of the month after it', () => {
    const periods = [
      ...monthsBetween('2026-01', '2026-08'),
      regularPeriod('2026-09', 'Pre Closed'),
      regularPeriod('2026-10', 'Open'),
    ]
    const result = plan(periods, { period: regularPeriod('2026-10', 'Open'), p13: null })
    expect(result.method).toBe('bridge')
    expect(result.openingPeriod?.periodeId).toBe('r2026-09')
    expect(ids(result.movementPeriods)).toEqual(['r2026-09', 'r2026-10'])
    expect(result.unclosedCount).toBe(2)
    expect(result.provisional).toBe(true)
  })

  it('bridge over several months that were never closed', () => {
    const periods = [
      ...monthsBetween('2026-01', '2026-05'),
      ...monthsBetween('2026-06', '2026-09', 'Pre Closed'),
      regularPeriod('2026-10', 'Open'),
    ]
    const result = plan(periods, { period: regularPeriod('2026-10', 'Open'), p13: null })
    expect(result.method).toBe('bridge')
    expect(result.openingPeriod?.periodeId).toBe('r2026-06')
    expect(ids(result.movementPeriods)).toEqual(['r2026-06', 'r2026-07', 'r2026-08', 'r2026-09', 'r2026-10'])
    expect(result.unclosedCount).toBe(5)
  })

  it('full-history when the opening period has no saved opening balances', () => {
    const periods = [...monthsBetween('2026-01', '2026-02'), regularPeriod('2026-03', 'Open')]
    const result = plan(periods, { period: regularPeriod('2026-03', 'Open'), p13: null }, false)
    expect(result.method).toBe('full-history')
    expect(result.openingPeriod).toBeNull()
    expect(ids(result.movementPeriods)).toEqual(['r2026-01', 'r2026-02', 'r2026-03'])
  })

  it('full-history when no period is Closed and the earliest period has no opening balances', () => {
    const periods = monthsBetween('2026-01', '2026-03', 'Open')
    const result = plan(periods, { period: regularPeriod('2026-03', 'Open'), p13: null }, false)
    expect(result.method).toBe('full-history')
    expect(ids(result.movementPeriods)).toEqual(['r2026-01', 'r2026-02', 'r2026-03'])
  })

  it('never counts a period after the report period', () => {
    const periods = [...monthsBetween('2026-01', '2026-06'), ...monthsBetween('2026-07', '2026-09', 'Open')]
    const result = plan(periods, { period: regularPeriod('2026-06', 'Closed'), p13: null })
    expect(ids(result.movementPeriods)).toEqual(['r2026-06'])
    expect(result.unclosedCount).toBe(0)
  })

  it('adds the report period 13 only when the target includes it', () => {
    const p13 = period13Of(2025)
    const periods = [...monthsBetween('2025-01', '2025-12'), p13]
    const december = regularPeriod('2025-12', 'Closed')
    expect(ids(plan(periods, { period: december, p13: null }).movementPeriods)).toEqual(['r2025-12'])
    expect(ids(plan(periods, { period: december, p13 }).movementPeriods)).toEqual(['r2025-12', 'p13-2025'])
  })

  it('counts the period 13 of an earlier month as history in a bridge', () => {
    const p13 = period13Of(2025)
    const periods = [
      ...monthsBetween('2025-01', '2025-11'),
      regularPeriod('2025-12', 'Pre Closed'),
      p13,
      regularPeriod('2026-01', 'Pre Closed'),
      regularPeriod('2026-02', 'Open'),
    ]
    const result = plan(periods, { period: regularPeriod('2026-02', 'Open'), p13: null })
    expect(result.method).toBe('bridge')
    expect(result.openingPeriod?.periodeId).toBe('r2025-12')
    expect(ids(result.movementPeriods)).toEqual(['r2025-12', 'p13-2025', 'r2026-01', 'r2026-02'])
  })

  it('leaves out a period 13 that ended before the opening period starts', () => {
    const periods = [...monthsBetween('2025-01', '2025-12'), period13Of(2025), regularPeriod('2026-01', 'Open')]
    const result = plan(periods, { period: regularPeriod('2026-01', 'Open'), p13: null })
    expect(result.method).toBe('opening-table')
    expect(ids(result.movementPeriods)).toEqual(['r2026-01'])
  })

  it('ignores periods of type 2 and 3', () => {
    const odd: Period = { ...regularPeriod('2026-02', 'Pre Closed'), periodeId: 'odd', type: 3 }
    const periods = [regularPeriod('2026-01', 'Closed'), odd, regularPeriod('2026-02', 'Open')]
    const result = plan(periods, { period: regularPeriod('2026-02', 'Open'), p13: null })
    expect(ids(result.movementPeriods)).toEqual(['r2026-02'])
  })
})
