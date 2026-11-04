import type { Period } from '../../core/types'

/** What a quick count of one GL header table says about a period. Strings, because ids can be large. */
export type PeriodHeaderStats = {
  journals: string
  maxGlId: string
  posted: string
  canceled: string
}

/**
 * The parts of the period row itself. A change here means the snapshot describes something else
 * (another GL table, other dates), whatever the journals say.
 */
export function periodKey(period: Pick<Period, 'tableName' | 'startDate' | 'endDate' | 'type'>): string {
  return `${period.tableName}|${period.startDate}|${period.endDate}|${period.type}`
}

/** Journal counts of the period: a journal added, removed, posted, un-posted or canceled changes it. */
export function statsKey(stats: PeriodHeaderStats): string {
  return `${stats.journals}:${stats.maxGlId}:${stats.posted}:${stats.canceled}`
}

/** What the snapshot remembers about one built period (times as epoch milliseconds, null when unknown). */
export type BuiltPeriodState = {
  periodKey: string | null
  statsKey: string | null
  builtAtMs: number | null
  checkedAtMs: number | null
}

export type VerifyDecision = 'keep' | 'check-stats' | 'rebuild'

/** The newest closed periods are the ones an admin is most likely to re-open. */
export const NEWEST_CLOSED_PERIODS = 2
/** A newest period is rebuilt in full at least this often (catches edits that no count can see). */
export const DEEP_REBUILD_MS = 24 * 60 * 60 * 1000
/** An older period has its journal counts compared at most this often. */
export const OLDER_CHECK_MS = 6 * 60 * 60 * 1000

/** What to do with a closed period that is already in the snapshot. */
export function verifyDecision(input: {
  period: Pick<Period, 'tableName' | 'startDate' | 'endDate' | 'type'>
  built: BuiltPeriodState
  isNewest: boolean
  nowMs: number
}): VerifyDecision {
  const { period, built, isNewest, nowMs } = input
  if (built.periodKey === null || built.statsKey === null) return 'rebuild'
  if (built.periodKey !== periodKey(period)) return 'rebuild'
  if (isNewest && (built.builtAtMs === null || nowMs - built.builtAtMs > DEEP_REBUILD_MS)) return 'rebuild'
  if (isNewest || built.checkedAtMs === null || nowMs - built.checkedAtMs >= OLDER_CHECK_MS) return 'check-stats'
  return 'keep'
}
