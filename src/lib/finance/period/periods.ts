import { PERIOD_TYPE, isPeriodOpen } from '../../core/period'
import type { Preset } from './presets'
import type { IsoDate, Period, ResolvedFilter } from '../../core/types'

export type ResolvedPeriod = Pick<
  ResolvedFilter,
  'd1' | 'asOf' | 'periodIds' | 'compare' | 'today'
> & {
  months: string[] // 'YYYY-MM' months in range
  missingMonths: string[] // months without a type-0 period row
  hasOpenPeriod: boolean // range contains an Open/Pre Closed period
}

function pad(n: number): string {
  return String(n).padStart(2, '0')
}

function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0).getDate()
  return `${year}-${pad(month)}-${pad(d)}`
}

function generateMonthsList(startYear: number, startMonth: number, count: number): string[] {
  const res: string[] = []
  let y = startYear
  let m = startMonth
  for (let i = 0; i < count; i++) {
    res.push(`${y}-${pad(m)}`)
    m++
    if (m > 12) {
      m = 1
      y++
    }
  }
  return res
}

/**
 * The periods that belong to a window: the regular period of each month, plus the period 13 rows that end inside
 * the window when `withP13` is on. `missingMonths` are the months without a regular period row.
 */
function resolvePeriodIds(
  window: { months: string[]; d1: string; asOf: string },
  withP13: boolean,
  periods: Period[],
): { periodIds: string[]; missingMonths: string[]; hasOpenPeriod: boolean } {
  const monthsSet = new Set(window.months)
  const matchedMonths = new Set<string>()
  const periodIds: string[] = []
  let hasOpen = false

  for (const p of periods) {
    const monthKey = p.startDate.slice(0, 7)
    const isRegular = p.type === PERIOD_TYPE.REGULAR
    const inWindow = isRegular
      ? monthsSet.has(monthKey)
      : p.type === PERIOD_TYPE.PERIOD_13 && withP13 && p.endDate >= window.d1 && p.endDate <= window.asOf
    if (!inWindow) continue

    if (isRegular) matchedMonths.add(monthKey)
    periodIds.push(p.periodeId)
    if (isPeriodOpen(p)) hasOpen = true
  }

  const missingMonths = window.months.filter((m) => !matchedMonths.has(m))

  return { periodIds, missingMonths, hasOpenPeriod: hasOpen }
}

export type MonthRange = { from?: string; to?: string }

const MAX_RANGE_MONTHS = 60

/** Number of months from `from` to `to` inclusive, or 0 when the range is invalid. */
function rangeLength(range: MonthRange | undefined): number {
  if (!range?.from || !range.to) return 0
  const [fy, fm] = range.from.split('-').map(Number)
  const [ty, tm] = range.to.split('-').map(Number)
  const count = (ty! - fy!) * 12 + (tm! - fm!) + 1
  return count >= 1 && count <= MAX_RANGE_MONTHS ? count : 0
}

/** The months a preset covers, and the equally long window right before it that the KPI cards compare with. */
type PeriodWindow = {
  months: string[]
  d1: string
  asOf: string
  compareMonths: string[]
  compareD1: string
  compareAsOf: string
}

/** Comparison = the range of the same length that ends right before this one. */
function customWindow(range: MonthRange, count: number, today: IsoDate): PeriodWindow {
  const [fy, fm] = range.from!.split('-').map(Number) as [number, number]
  const [ty, tm] = range.to!.split('-').map(Number) as [number, number]
  const end = lastDayOfMonth(ty, tm)

  const prevIndex = fy * 12 + (fm - 1) - count
  const pY = Math.floor(prevIndex / 12)
  const pM = (prevIndex % 12) + 1
  const endIndex = prevIndex + count - 1

  return {
    months: generateMonthsList(fy, fm, count),
    d1: `${fy}-${pad(fm)}-01`,
    asOf: end > today ? today : end,
    compareMonths: generateMonthsList(pY, pM, count),
    compareD1: `${pY}-${pad(pM)}-01`,
    compareAsOf: lastDayOfMonth(Math.floor(endIndex / 12), (endIndex % 12) + 1),
  }
}

/** One whole month, compared with the month before it. */
function monthWindow(y: number, m: number, asOf: string): PeriodWindow {
  const prevMonth = m === 1 ? 12 : m - 1
  const prevYear = m === 1 ? y - 1 : y
  return {
    months: [`${y}-${pad(m)}`],
    d1: `${y}-${pad(m)}-01`,
    asOf,
    compareMonths: [`${prevYear}-${pad(prevMonth)}`],
    compareD1: `${prevYear}-${pad(prevMonth)}-01`,
    compareAsOf: lastDayOfMonth(prevYear, prevMonth),
  }
}

function thisQuarterWindow(y: number, m: number, today: IsoDate): PeriodWindow {
  const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1
  let prevQStart = qStartMonth - 3
  let prevQYear = y
  if (prevQStart < 1) {
    prevQStart += 12
    prevQYear -= 1
  }
  return {
    months: generateMonthsList(y, qStartMonth, m - qStartMonth + 1),
    d1: `${y}-${pad(qStartMonth)}-01`,
    asOf: today,
    compareMonths: generateMonthsList(prevQYear, prevQStart, 3),
    compareD1: `${prevQYear}-${pad(prevQStart)}-01`,
    compareAsOf: lastDayOfMonth(prevQYear, prevQStart + 2),
  }
}

/** January up to the current month, compared with the same months a year earlier. */
function ytdWindow(y: number, m: number, today: IsoDate): PeriodWindow {
  return {
    months: generateMonthsList(y, 1, m),
    d1: `${y}-01-01`,
    asOf: today,
    compareMonths: generateMonthsList(y - 1, 1, m),
    compareD1: `${y - 1}-01-01`,
    compareAsOf: lastDayOfMonth(y - 1, m),
  }
}

/** The 12 months ending with the current one, compared with the 12 months a year earlier. */
function last12MonthsWindow(y: number, m: number, today: IsoDate): PeriodWindow {
  let startMonth = m + 1
  let startYear = y - 1
  if (startMonth > 12) {
    startMonth = 1
    startYear = y
  }
  return {
    months: generateMonthsList(startYear, startMonth, 12),
    d1: `${startYear}-${pad(startMonth)}-01`,
    asOf: today,
    compareMonths: generateMonthsList(startYear - 1, startMonth, 12),
    compareD1: `${startYear - 1}-${pad(startMonth)}-01`,
    compareAsOf: lastDayOfMonth(y - 1, m),
  }
}

function presetWindow(preset: Preset, today: IsoDate): PeriodWindow {
  const [yearStr, monthStr] = today.split('-')
  const y = Number(yearStr)
  const m = Number(monthStr)

  switch (preset) {
    case 'this-month':
      return monthWindow(y, m, today)
    case 'last-month': {
      const lastMonth = m === 1 ? 12 : m - 1
      const lastMonthYear = m === 1 ? y - 1 : y
      return monthWindow(lastMonthYear, lastMonth, lastDayOfMonth(lastMonthYear, lastMonth))
    }
    case 'this-quarter':
      return thisQuarterWindow(y, m, today)
    case 'ytd':
      return ytdWindow(y, m, today)
    case 'last-12m':
      return last12MonthsWindow(y, m, today)
    default:
      return { months: [], d1: '', asOf: today, compareMonths: [], compareD1: '', compareAsOf: '' }
  }
}

export function resolvePeriod(
  preset: Preset,
  includeP13: boolean,
  today: IsoDate,
  periods: Period[],
  range?: MonthRange,
): ResolvedPeriod {
  const customCount = rangeLength(range)
  const isP13Allowed = customCount > 0 || preset === 'ytd' || preset === 'last-12m'
  const { months, d1, asOf, compareMonths, compareD1, compareAsOf } =
    customCount > 0 ? customWindow(range!, customCount, today) : presetWindow(preset, today)

  const withP13 = includeP13 && isP13Allowed
  const currentResolution = resolvePeriodIds({ months, d1, asOf }, withP13, periods)
  const compareResolution = resolvePeriodIds(
    { months: compareMonths, d1: compareD1, asOf: compareAsOf },
    withP13,
    periods,
  )

  return {
    d1,
    asOf,
    periodIds: currentResolution.periodIds,
    months,
    missingMonths: currentResolution.missingMonths,
    hasOpenPeriod: currentResolution.hasOpenPeriod,
    today,
    compare: {
      d1: compareD1,
      asOf: compareAsOf,
      periodIds: compareResolution.periodIds,
    },
  }
}
