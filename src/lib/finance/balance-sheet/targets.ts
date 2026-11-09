import { PERIOD_TYPE, isRegularPeriod } from '../period/period-type'
import { previousFiscalYearEndKey } from './fiscal-year'
import type { Id, IsoDate, Period } from '../../core/types'

/** What the balance sheet is compared with (the `compare` search parameter of the page). */
export const BALANCE_COMPARE_MODES = ['year-end', 'prev-month', 'prev-year', 'none'] as const
export type BalanceCompareMode = (typeof BALANCE_COMPARE_MODES)[number]

/** The date a balance sheet describes: the end of one regular period, plus its period 13 when that is included. */
export type BalanceTarget = {
  period: Period
  /** Period 13 whose journals are added to the period (the "include period 13" switch); null when not included. */
  p13: Period | null
}

function sortedRegularPeriods(periods: readonly Period[]): Period[] {
  return periods.filter(isRegularPeriod).sort((a, b) => a.startDate.localeCompare(b.startDate))
}

/** The period 13 of the month of `period`: a type 1 period that ends inside that month. */
function period13Of(periods: readonly Period[], period: Period): Period | null {
  return (
    periods.find(
      (p) => p.type === PERIOD_TYPE.PERIOD_13 && p.endDate >= period.startDate && p.endDate <= period.endDate,
    ) ?? null
  )
}

/**
 * The balance sheet describes the END of the filter's period range: its last regular period. When the range holds no
 * period (a month without a period row), the regular period that contains `asOf` is used; null when there is none.
 * The period 13 is added only when the filter included it.
 */
export function resolveBalanceTarget(
  periods: readonly Period[],
  input: { asOf: IsoDate; periodIds: readonly Id[] },
): BalanceTarget | null {
  const regular = sortedRegularPeriods(periods)
  const wanted = new Set(input.periodIds)
  const inRange = regular.filter((p) => wanted.has(p.periodeId))
  const period = inRange.at(-1) ?? regular.find((p) => p.startDate <= input.asOf && input.asOf <= p.endDate)
  if (!period) return null
  const p13 = period13Of(periods, period)
  return { period, p13: p13 && wanted.has(p13.periodeId) ? p13 : null }
}

/** 'YYYY-MM' of the month `deltaMonths` away from the month of `startDate`. */
function shiftMonthKey(startDate: IsoDate, deltaMonths: number): string {
  const [year, month] = startDate.split('-').map(Number)
  const index = (year ?? 0) * 12 + ((month ?? 1) - 1) + deltaMonths
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, '0')}`
}

/**
 * The period the balance sheet is compared with, or null when no comparison is wanted or the period does not exist.
 * - year-end: the last month of the fiscal year that ended before the report month;
 * - prev-month: the calendar month before; prev-year: the same month one year earlier.
 * The comparison period gets its own period 13 when the main report includes its period 13.
 */
export function resolveCompareTarget(
  mode: BalanceCompareMode,
  target: BalanceTarget,
  periods: readonly Period[],
  fiscalEndMonth: number,
): BalanceTarget | null {
  if (mode === 'none') return null
  const startDate = target.period.startDate
  const key =
    mode === 'prev-month'
      ? shiftMonthKey(startDate, -1)
      : mode === 'prev-year'
        ? shiftMonthKey(startDate, -12)
        : previousFiscalYearEndKey(startDate, fiscalEndMonth)
  const period = sortedRegularPeriods(periods).find((p) => p.startDate.slice(0, 7) === key)
  if (!period) return null
  return { period, p13: target.p13 ? period13Of(periods, period) : null }
}
