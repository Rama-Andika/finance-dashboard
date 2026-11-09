import { describe, expect, it } from 'vitest'
import { monthsBetween, period13Of, regularPeriod } from 'tests/fixtures/balance-sheet.fixture'
import { resolveBalanceTarget, resolveCompareTarget } from './targets'
import type { Period } from '../../core/types'

const periods: Period[] = [
  ...monthsBetween('2025-01', '2025-12'),
  period13Of(2025),
  ...monthsBetween('2026-01', '2026-10'),
]

describe('resolveBalanceTarget', () => {
  it('takes the last regular period of the filter range', () => {
    const range = ['r2026-08', 'r2026-09', 'r2026-10']
    const target = resolveBalanceTarget(periods, { asOf: '2026-10-31', periodIds: range })
    expect(target?.period.periodeId).toBe('r2026-10')
    expect(target?.p13).toBeNull()
  })

  it('does not depend on the order of the period ids', () => {
    const target = resolveBalanceTarget(periods, {
      asOf: '2026-10-31',
      periodIds: ['r2026-10', 'r2026-08', 'r2026-09'],
    })
    expect(target?.period.periodeId).toBe('r2026-10')
  })

  it('adds the period 13 only when the filter included it', () => {
    const withP13 = resolveBalanceTarget(periods, {
      asOf: '2025-12-31',
      periodIds: ['r2025-11', 'r2025-12', 'p13-2025'],
    })
    expect(withP13?.period.periodeId).toBe('r2025-12')
    expect(withP13?.p13?.periodeId).toBe('p13-2025')

    const without = resolveBalanceTarget(periods, { asOf: '2025-12-31', periodIds: ['r2025-11', 'r2025-12'] })
    expect(without?.p13).toBeNull()
  })

  it('ignores a period 13 that belongs to another month', () => {
    const target = resolveBalanceTarget(periods, { asOf: '2025-11-30', periodIds: ['r2025-11', 'p13-2025'] })
    expect(target?.period.periodeId).toBe('r2025-11')
    expect(target?.p13).toBeNull()
  })

  it('falls back to the regular period that contains asOf when the range holds no period', () => {
    const target = resolveBalanceTarget(periods, { asOf: '2026-03-15', periodIds: [] })
    expect(target?.period.periodeId).toBe('r2026-03')
  })

  it('gives null when no regular period contains asOf and the range is empty', () => {
    expect(resolveBalanceTarget(periods, { asOf: '2026-12-15', periodIds: [] })).toBeNull()
    expect(resolveBalanceTarget([], { asOf: '2026-10-15', periodIds: [] })).toBeNull()
  })
})

describe('resolveCompareTarget', () => {
  const target = { period: regularPeriod('2026-10'), p13: null }

  it('has no comparison for mode none', () => {
    expect(resolveCompareTarget('none', target, periods, 12)).toBeNull()
  })

  it('year-end: the last month of the previous fiscal year', () => {
    expect(resolveCompareTarget('year-end', target, periods, 12)?.period.periodeId).toBe('r2025-12')
  })

  it('year-end with a fiscal year that ends in June', () => {
    expect(resolveCompareTarget('year-end', target, periods, 6)?.period.periodeId).toBe('r2026-06')
  })

  it('year-end when the report month is the last month of the fiscal year goes a year back', () => {
    const december = { period: regularPeriod('2026-12'), p13: null }
    const all = [...periods, regularPeriod('2026-11'), regularPeriod('2026-12')]
    expect(resolveCompareTarget('year-end', december, all, 12)?.period.periodeId).toBe('r2025-12')
  })

  it('prev-month and prev-year', () => {
    expect(resolveCompareTarget('prev-month', target, periods, 12)?.period.periodeId).toBe('r2026-09')
    expect(resolveCompareTarget('prev-year', target, periods, 12)?.period.periodeId).toBe('r2025-10')
  })

  it('prev-month crosses the year boundary', () => {
    const january = { period: regularPeriod('2026-01'), p13: null }
    expect(resolveCompareTarget('prev-month', january, periods, 12)?.period.periodeId).toBe('r2025-12')
  })

  it('gives null when the comparison period does not exist', () => {
    const early = { period: regularPeriod('2025-03'), p13: null }
    expect(resolveCompareTarget('prev-year', early, periods, 12)).toBeNull()
    expect(resolveCompareTarget('year-end', early, periods, 12)).toBeNull()
  })

  it('gives the comparison period its own period 13 when the main report includes period 13', () => {
    const december = { period: regularPeriod('2026-12'), p13: period13Of(2026) }
    const all = [...periods, regularPeriod('2026-11'), regularPeriod('2026-12'), period13Of(2026)]
    const compare = resolveCompareTarget('prev-year', december, all, 12)
    expect(compare?.period.periodeId).toBe('r2025-12')
    expect(compare?.p13?.periodeId).toBe('p13-2025')
  })

  it('leaves the comparison without a period 13 when the main report has none', () => {
    const december = { period: regularPeriod('2026-12'), p13: null }
    const all = [...periods, regularPeriod('2026-11'), regularPeriod('2026-12')]
    expect(resolveCompareTarget('prev-year', december, all, 12)?.p13).toBeNull()
  })
})
