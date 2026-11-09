import type { IsoDate, Lang } from '~/lib/core/types'

const MONTHS = {
  id: ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'],
  en: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'],
} as const

function parseIsoParts(iso: IsoDate): { year: number; month: number; day: number } {
  const parts = iso.split('-').map(Number)
  return {
    year: parts[0] || 0,
    month: parts[1] || 1,
    day: parts[2] || 1,
  }
}

export function formatDate(iso: IsoDate, lang: Lang): string {
  const { year, month, day } = parseIsoParts(iso)
  const monthName = MONTHS[lang][month - 1] || ''
  return `${day} ${monthName} ${year}`
}

/**
 * A moment in the viewer's own time zone as "03 Nov 2026, 23:08", with the month name of the interface language.
 * Returns an empty string for a text that is not a date.
 */
export function formatDateTime(timestamp: string, lang: Lang): string {
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return ''
  const two = (n: number) => String(n).padStart(2, '0')
  return `${two(d.getDate())} ${MONTHS[lang][d.getMonth()]} ${d.getFullYear()}, ${two(d.getHours())}:${two(d.getMinutes())}`
}

export function formatMonth(iso: IsoDate, lang: Lang): string {
  const { month } = parseIsoParts(iso)
  return MONTHS[lang][month - 1] || ''
}

export function formatMonthYear(iso: IsoDate, lang: Lang): string {
  const { year, month } = parseIsoParts(iso)
  const monthName = MONTHS[lang][month - 1] || ''
  return `${monthName} ${year}`
}

export function todayIn(timeZone: string, now?: Date): IsoDate {
  const d = now ?? new Date()
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(d)
}

export function addDays(iso: IsoDate, n: number): IsoDate {
  const { year, month, day } = parseIsoParts(iso)
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

export function diffDays(a: IsoDate, b: IsoDate): number {
  const pa = parseIsoParts(a)
  const pb = parseIsoParts(b)
  const da = new Date(Date.UTC(pa.year, pa.month - 1, pa.day))
  const db = new Date(Date.UTC(pb.year, pb.month - 1, pb.day))
  return Math.round((da.getTime() - db.getTime()) / (1000 * 60 * 60 * 24))
}

/** i18n key of the label that names the comparison period of a card ("Last month", "Same period last year", ...). */
export function compareLabelKey(filter: {
  preset: string
  from?: string | undefined
  to?: string | undefined
}): string {
  // A custom range has no named comparison period.
  if (filter.from && filter.to) return 'comparePeriod.default'
  switch (filter.preset) {
    case 'this-month':
    case 'last-month':
    case 'this-quarter':
    case 'ytd':
    case 'last-12m':
      return `comparePeriod.${filter.preset}`
    default:
      return 'comparePeriod.default'
  }
}
