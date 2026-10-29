import type { Preset } from '~/lib/filters/search-schema'
import type { IsoDate, Period, ResolvedFilter } from './types'

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

function resolvePeriodIds(
  months: string[],
  d1: string,
  asOf: string,
  includeP13: boolean,
  isP13AllowedPreset: boolean,
  periods: Period[],
): { periodIds: string[]; missingMonths: string[]; hasOpenPeriod: boolean } {
  const monthsSet = new Set(months)
  const matchedType0Months = new Set<string>()
  const periodIds: string[] = []
  let hasOpen = false

  for (const p of periods) {
    if (p.type === 0) {
      const monthKey = p.startDate.slice(0, 7)
      if (monthsSet.has(monthKey)) {
        matchedType0Months.add(monthKey)
        periodIds.push(p.periodeId)
        if (p.status === 'Open' || p.status === 'Pre Closed') {
          hasOpen = true
        }
      }
    } else if (p.type === 1 && includeP13 && isP13AllowedPreset) {
      if (p.endDate >= d1 && p.endDate <= asOf) {
        periodIds.push(p.periodeId)
        if (p.status === 'Open' || p.status === 'Pre Closed') {
          hasOpen = true
        }
      }
    }
  }

  const missingMonths = months.filter((m) => !matchedType0Months.has(m))

  return { periodIds, missingMonths, hasOpenPeriod: hasOpen }
}

export function resolvePeriod(
  preset: Preset,
  includeP13: boolean,
  today: IsoDate,
  periods: Period[],
): ResolvedPeriod {
  const [yearStr, monthStr] = today.split('-')
  const y = Number(yearStr)
  const m = Number(monthStr)

  let months: string[] = []
  let d1: string = ''
  let asOf: string = today

  let compareMonths: string[] = []
  let compareD1: string = ''
  let compareAsOf: string = ''

  const isP13Allowed = preset === 'ytd' || preset === 'last-12m'

  switch (preset) {
    case 'this-month': {
      months = [`${y}-${pad(m)}`]
      d1 = `${y}-${pad(m)}-01`
      asOf = today

      const prevMonth = m === 1 ? 12 : m - 1
      const prevYear = m === 1 ? y - 1 : y
      compareMonths = [`${prevYear}-${pad(prevMonth)}`]
      compareD1 = `${prevYear}-${pad(prevMonth)}-01`
      compareAsOf = lastDayOfMonth(prevYear, prevMonth)
      break
    }

    case 'last-month': {
      const lm = m === 1 ? 12 : m - 1
      const ly = m === 1 ? y - 1 : y
      months = [`${ly}-${pad(lm)}`]
      d1 = `${ly}-${pad(lm)}-01`
      asOf = lastDayOfMonth(ly, lm)

      const prevMonth = lm === 1 ? 12 : lm - 1
      const prevYear = lm === 1 ? ly - 1 : ly
      compareMonths = [`${prevYear}-${pad(prevMonth)}`]
      compareD1 = `${prevYear}-${pad(prevMonth)}-01`
      compareAsOf = lastDayOfMonth(prevYear, prevMonth)
      break
    }

    case 'this-quarter': {
      const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1
      const count = m - qStartMonth + 1
      months = generateMonthsList(y, qStartMonth, count)
      d1 = `${y}-${pad(qStartMonth)}-01`
      asOf = today

      let prevQStart = qStartMonth - 3
      let prevQYear = y
      if (prevQStart < 1) {
        prevQStart += 12
        prevQYear -= 1
      }
      compareMonths = generateMonthsList(prevQYear, prevQStart, 3)
      compareD1 = `${prevQYear}-${pad(prevQStart)}-01`
      compareAsOf = lastDayOfMonth(prevQYear, prevQStart + 2)
      break
    }

    case 'ytd': {
      months = generateMonthsList(y, 1, m)
      d1 = `${y}-01-01`
      asOf = today

      compareMonths = generateMonthsList(y - 1, 1, m)
      compareD1 = `${y - 1}-01-01`
      compareAsOf = lastDayOfMonth(y - 1, m)
      break
    }

    case 'last-12m': {
      let startMonth = m + 1
      let startYear = y - 1
      if (startMonth > 12) {
        startMonth = 1
        startYear = y
      }
      months = generateMonthsList(startYear, startMonth, 12)
      d1 = `${startYear}-${pad(startMonth)}-01`
      asOf = today

      const compStartYear = startYear - 1
      compareMonths = generateMonthsList(compStartYear, startMonth, 12)
      compareD1 = `${compStartYear}-${pad(startMonth)}-01`
      compareAsOf = lastDayOfMonth(y - 1, m)
      break
    }
  }

  const currentResolution = resolvePeriodIds(
    months,
    d1,
    asOf,
    includeP13,
    isP13Allowed,
    periods,
  )

  const compareResolution = resolvePeriodIds(
    compareMonths,
    compareD1,
    compareAsOf,
    includeP13,
    isP13Allowed,
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
