import type { IsoDate } from '../../core/types'

/** December: the last month of the fiscal year when the ERP value is missing or not a month. */
export const DEFAULT_FISCAL_END_MONTH = 12

/**
 * The last month of the fiscal year (1 = January … 12 = December) from `company.end_fiscal_month`.
 * The ERP stores that column as a 0-based month number (0 = January … 11 = December), because its Java code compares it
 * with `Date.getMonth()`. A value that is missing, fractional, below 0 or above 11 gives null.
 */
export function fiscalEndMonthOf(raw: number | string | null | undefined): number | null {
  if (raw === null || raw === undefined || raw === '') return null
  const n = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isInteger(n) || n < 0 || n > 11) return null
  return n + 1
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

/** Year and month (1–12) of an ISO date. */
function yearMonthOf(date: IsoDate): { year: number; month: number } {
  const [year, month] = date.split('-').map(Number)
  return { year: year ?? 0, month: month ?? 1 }
}

/** Year of the last month of the fiscal year that ended before the month of `date`. */
function previousEndYear(date: IsoDate, endMonth: number): number {
  const { year, month } = yearMonthOf(date)
  return month > endMonth ? year : year - 1
}

/**
 * 'YYYY-MM' of the last month of the fiscal year that ended before the month of `date`.
 * With a fiscal year that ends in December, any date in 2026 gives '2025-12'. When `date` is itself in the last
 * month of a fiscal year, that year has not ended before it, so the answer is a year earlier.
 */
export function previousFiscalYearEndKey(date: IsoDate, endMonth: number): string {
  return `${previousEndYear(date, endMonth)}-${pad(endMonth)}`
}

/** First day of the fiscal year that contains `date` (`endMonth`: 1 = January … 12 = December). */
export function fiscalYearStart(date: IsoDate, endMonth: number): IsoDate {
  const endYear = previousEndYear(date, endMonth)
  // A fiscal year starts in the month after the last month of the one before it.
  const startYear = endMonth === 12 ? endYear + 1 : endYear
  const startMonth = endMonth === 12 ? 1 : endMonth + 1
  return `${startYear}-${pad(startMonth)}-01`
}
