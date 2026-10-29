import { addDays } from '~/lib/format/date'
import type { IsoDate } from '../../core/types'

/** The newest month-ends can still change (late entries), so they are rebuilt until they are final. */
export const PROVISIONAL_MONTHS = 2
/** A provisional snapshot that is at least this old (in hours) is rebuilt. */
export const PROVISIONAL_MAX_AGE_HOURS = 24

/**
 * Last day of each of the `count` most recent COMPLETED months before `today`, newest first.
 * The month that `today` is in is not completed, so it is never included.
 * Example: today 2026-10-29 and count 3 give ['2026-09-30', '2026-08-31', '2026-07-31'].
 */
export function monthEndsBefore(today: IsoDate, count: number): IsoDate[] {
  const out: IsoDate[] = []
  let monthStart: IsoDate = `${today.slice(0, 7)}-01`
  for (let i = 0; i < count; i += 1) {
    const end = addDays(monthStart, -1)
    out.push(end)
    monthStart = `${end.slice(0, 7)}-01`
  }
  return out
}

/**
 * True when a month-end can no longer change: it is older than the provisional months, or its ERP period is Closed.
 * `index` is the position of `monthEnd` in the newest-first list from `monthEndsBefore` (0 = last month).
 */
export function isFinalMonthEnd(index: number, monthEnd: IsoDate, closedMonthEnds: ReadonlySet<IsoDate>): boolean {
  return index >= PROVISIONAL_MONTHS || closedMonthEnds.has(monthEnd)
}

export type HistBuilt = {
  asOfDate: IsoDate
  /** Whether the snapshot was built when the month was final */
  isFinal: boolean
  /** Hours since it was built */
  ageHours: number
}

export type HistPlanInput = {
  today: IsoDate
  /** How many completed months to keep (0 = no history) */
  months: number
  /** Month-ends whose ERP period (type 0) has status Closed */
  closedMonthEnds: ReadonlySet<IsoDate>
  /** What is in the history tables now */
  built: readonly HistBuilt[]
  /** At most this many month-ends are returned in `build` */
  maxBuilds: number
}

export type HistPlan = {
  /** Month-ends to build now: missing ones first (newest first), then outdated provisional ones */
  build: IsoDate[]
  /** Built month-ends that are no longer wanted (older than `months`, or history is switched off) */
  prune: IsoDate[]
}

export function planHistBuilds(input: HistPlanInput): HistPlan {
  const wanted = monthEndsBefore(input.today, input.months)
  const builtBy = new Map(input.built.map((b) => [b.asOfDate, b] as const))

  const missing: IsoDate[] = []
  const outdated: IsoDate[] = []
  wanted.forEach((monthEnd, index) => {
    const existing = builtBy.get(monthEnd)
    if (!existing) {
      missing.push(monthEnd)
      return
    }
    if (existing.isFinal) return
    if (isFinalMonthEnd(index, monthEnd, input.closedMonthEnds) || existing.ageHours >= PROVISIONAL_MAX_AGE_HOURS) {
      outdated.push(monthEnd)
    }
  })

  const wantedSet = new Set(wanted)
  return {
    build: [...missing, ...outdated].slice(0, Math.max(0, input.maxBuilds)),
    prune: input.built.map((b) => b.asOfDate).filter((d) => !wantedSet.has(d)),
  }
}
