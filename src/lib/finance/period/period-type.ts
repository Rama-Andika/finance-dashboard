import type { Period } from '../../core/types'

/** `periode.type`: what kind of accounting period a row is. */
export const PERIOD_TYPE = { REGULAR: 0, PERIOD_13: 1, PRE_CLOSED: 2, UNKNOWN: 3 } as const

/** A regular calendar-month period (not period 13). */
export const isRegularPeriod = (p: Pick<Period, 'type'>): boolean => p.type === PERIOD_TYPE.REGULAR

/** The period is not closed yet (status Open or Pre Closed), so its figures can still change. */
export const isPeriodOpen = (p: Pick<Period, 'status'>): boolean => p.status === 'Open' || p.status === 'Pre Closed'
