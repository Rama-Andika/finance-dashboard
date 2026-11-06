import { describe, expect, it } from 'vitest'
import {
  AP_AR_FORMULA_VERSION,
  isFinalMonthEnd,
  monthEndsBefore,
  planHistBuilds,
  type HistBuilt,
} from './ap-ar-hist-plan'

const TODAY = '2026-10-29'
const NONE = new Set<string>()

const final = (asOfDate: string, formulaVersion = AP_AR_FORMULA_VERSION): HistBuilt => ({
  asOfDate,
  isFinal: true,
  ageHours: 500,
  formulaVersion,
})
const provisional = (asOfDate: string, ageHours: number, formulaVersion = AP_AR_FORMULA_VERSION): HistBuilt => ({
  asOfDate,
  isFinal: false,
  ageHours,
  formulaVersion,
})

describe('monthEndsBefore', () => {
  it('lists completed month-ends, newest first', () => {
    expect(monthEndsBefore(TODAY, 3)).toEqual(['2026-09-30', '2026-08-31', '2026-07-31'])
  })

  it('crosses a year boundary', () => {
    expect(monthEndsBefore('2026-01-15', 2)).toEqual(['2025-12-31', '2025-11-30'])
  })

  it('knows leap years', () => {
    expect(monthEndsBefore('2024-03-10', 2)).toEqual(['2024-02-29', '2024-01-31'])
  })

  it('returns nothing for a count of 0', () => {
    expect(monthEndsBefore(TODAY, 0)).toEqual([])
  })
})

describe('isFinalMonthEnd', () => {
  it('keeps the two newest months provisional unless their period is closed', () => {
    expect(isFinalMonthEnd(0, '2026-09-30', NONE)).toBe(false)
    expect(isFinalMonthEnd(1, '2026-08-31', NONE)).toBe(false)
    expect(isFinalMonthEnd(0, '2026-09-30', new Set(['2026-09-30']))).toBe(true)
    expect(isFinalMonthEnd(2, '2026-07-31', NONE)).toBe(true)
  })
})

describe('planHistBuilds', () => {
  it('builds missing month-ends newest first, limited by maxBuilds', () => {
    const plan = planHistBuilds({
      today: TODAY,
      months: 4,
      closedMonthEnds: NONE,
      built: [],
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 2,
    })
    expect(plan.build).toEqual(['2026-09-30', '2026-08-31'])
    expect(plan.prune).toEqual([])
  })

  it('skips snapshots that are already final', () => {
    const built = [final('2026-09-30'), final('2026-08-31'), final('2026-07-31')]
    const plan = planHistBuilds({
      today: TODAY,
      months: 3,
      closedMonthEnds: NONE,
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan).toEqual({ build: [], prune: [] })
  })

  it('does not rebuild a fresh provisional snapshot', () => {
    const built = [provisional('2026-09-30', 1), provisional('2026-08-31', 5), final('2026-07-31')]
    const plan = planHistBuilds({
      today: TODAY,
      months: 3,
      closedMonthEnds: NONE,
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan.build).toEqual([])
  })

  it('rebuilds a provisional snapshot that is a day old', () => {
    const built = [provisional('2026-09-30', 24), provisional('2026-08-31', 5), final('2026-07-31')]
    const plan = planHistBuilds({
      today: TODAY,
      months: 3,
      closedMonthEnds: NONE,
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan.build).toEqual(['2026-09-30'])
  })

  it('rebuilds a provisional snapshot once its period is closed', () => {
    const built = [provisional('2026-09-30', 1), final('2026-08-31'), final('2026-07-31')]
    const plan = planHistBuilds({
      today: TODAY,
      months: 3,
      closedMonthEnds: new Set(['2026-09-30']),
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan.build).toEqual(['2026-09-30'])
  })

  it('rebuilds a provisional snapshot that has aged out of the newest months', () => {
    const built = [final('2026-09-30'), final('2026-08-31'), provisional('2026-07-31', 1)]
    const plan = planHistBuilds({
      today: TODAY,
      months: 3,
      closedMonthEnds: NONE,
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan.build).toEqual(['2026-07-31'])
  })

  it('builds missing months before rebuilding outdated ones', () => {
    const built = [provisional('2026-09-30', 30), final('2026-08-31')]
    const plan = planHistBuilds({
      today: TODAY,
      months: 3,
      closedMonthEnds: NONE,
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan.build).toEqual(['2026-07-31', '2026-09-30'])
  })

  it('prunes snapshots outside the kept months', () => {
    const built = [final('2026-09-30'), final('2026-08-31'), final('2025-01-31')]
    const plan = planHistBuilds({
      today: TODAY,
      months: 2,
      closedMonthEnds: NONE,
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan).toEqual({ build: [], prune: ['2025-01-31'] })
  })

  it('removes everything when no history is wanted', () => {
    const plan = planHistBuilds({
      today: TODAY,
      months: 0,
      closedMonthEnds: NONE,
      built: [final('2026-09-30')],
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan).toEqual({ build: [], prune: ['2026-09-30'] })
  })

  it('rebuilds a final month built with an older formula', () => {
    const built = [final('2026-09-30', 1), final('2026-08-31'), final('2026-07-31')]
    const plan = planHistBuilds({
      today: TODAY,
      months: 3,
      closedMonthEnds: NONE,
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan.build).toEqual(['2026-09-30'])
  })

  it('rebuilds older formula months newest first and respects maxBuilds', () => {
    const built = [final('2026-09-30', 1), final('2026-08-31', 1), final('2026-07-31', 1)]
    const plan = planHistBuilds({
      today: TODAY,
      months: 3,
      closedMonthEnds: NONE,
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 2,
    })
    expect(plan.build).toEqual(['2026-09-30', '2026-08-31'])
  })

  it('builds missing months before rebuilding older formula ones', () => {
    const built = [final('2026-09-30', 1)]
    const plan = planHistBuilds({
      today: TODAY,
      months: 2,
      closedMonthEnds: NONE,
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan.build).toEqual(['2026-08-31', '2026-09-30'])
  })

  it('does not rebuild a month that already has the current formula version', () => {
    const built = [final('2026-09-30', 2), final('2026-08-31', 2), final('2026-07-31', 2)]
    const plan = planHistBuilds({
      today: TODAY,
      months: 3,
      closedMonthEnds: NONE,
      built,
      formulaVersion: AP_AR_FORMULA_VERSION,
      maxBuilds: 10,
    })
    expect(plan).toEqual({ build: [], prune: [] })
  })
})
