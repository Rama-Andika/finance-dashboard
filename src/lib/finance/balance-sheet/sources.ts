import { compareAsc } from '../../core/compare'
import { PERIOD_TYPE, isPeriodOpen, isRegularPeriod } from '../period/period-type'
import type { BalanceTarget } from './targets'
import type { Period } from '../../core/types'

/**
 * How the balances of a report date are reached:
 * - opening-table: the saved opening balances of the report period itself plus the movements of that period;
 * - bridge: the saved opening balances of an EARLIER period (the one after the last Closed period) plus the movements
 *   of every period from there to the report period (the periods in between are not closed, so no later opening exists);
 * - full-history: no saved opening balances can be used, so every posted movement since the start is added.
 */
export type BalanceMethod = 'opening-table' | 'bridge' | 'full-history'

export type BalanceSourcePlan = {
  method: BalanceMethod
  /** The period whose saved opening balances start the sum; null for full-history. */
  openingPeriod: Period | null
  /** The periods whose posted movements are added to the opening balances, oldest first. */
  movementPeriods: Period[]
  /** Regular periods up to and including the report period that are not Closed. */
  unclosedCount: number
  /** The report period itself is not Closed, so the figures can still change. */
  provisional: boolean
}

/** Oldest first; on the same start date the regular period comes before its period 13. */
export function byStartThenType(a: Period, b: Period): number {
  return compareAsc(a.startDate, b.startDate) || compareAsc(a.type, b.type)
}

/**
 * Chooses the periods that make up a balance. `openingPeriod` is the period after the last Closed period (from
 * `pickOpeningPeriod`), `openingExists` says whether it has saved opening balances.
 * Period 13 rows are added when they are history (they ended before the report period starts), or when the report
 * includes its own period 13. Periods of type 2 and 3 never count (no other page counts them either).
 */
export function planBalanceSources(input: {
  periods: readonly Period[]
  target: BalanceTarget
  openingPeriod: Period | null
  openingExists: boolean
}): BalanceSourcePlan {
  const { periods, target, openingPeriod } = input
  const useOpening = openingPeriod !== null && input.openingExists
  const from = useOpening ? openingPeriod.startDate : ''
  const targetStart = target.period.startDate

  const movementPeriods = periods
    .filter((p) => {
      if (p.type === PERIOD_TYPE.REGULAR) return p.startDate >= from && p.startDate <= targetStart
      if (p.type === PERIOD_TYPE.PERIOD_13) {
        if (target.p13 && p.periodeId === target.p13.periodeId) return true
        return p.endDate >= from && p.endDate < targetStart
      }
      return false
    })
    .sort(byStartThenType)

  const method: BalanceMethod = !useOpening
    ? 'full-history'
    : openingPeriod.periodeId === target.period.periodeId
      ? 'opening-table'
      : 'bridge'

  return {
    method,
    openingPeriod: useOpening ? openingPeriod : null,
    movementPeriods,
    unclosedCount: periods.filter((p) => isRegularPeriod(p) && p.startDate <= targetStart && isPeriodOpen(p)).length,
    provisional: target.period.status !== 'Closed',
  }
}
