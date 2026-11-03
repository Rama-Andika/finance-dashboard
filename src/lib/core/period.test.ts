import { describe, expect, it } from 'vitest'
import { PERIOD_TYPE, isPeriodOpen, isRegularPeriod } from './period'

describe('period helpers', () => {
  it('recognises regular periods by type', () => {
    expect(isRegularPeriod({ type: PERIOD_TYPE.REGULAR })).toBe(true)
    expect(isRegularPeriod({ type: PERIOD_TYPE.PERIOD_13 })).toBe(false)
    expect(isRegularPeriod({ type: PERIOD_TYPE.PRE_CLOSED })).toBe(false)
  })

  it('treats Open and Pre Closed as not closed yet', () => {
    expect(isPeriodOpen({ status: 'Open' })).toBe(true)
    expect(isPeriodOpen({ status: 'Pre Closed' })).toBe(true)
    expect(isPeriodOpen({ status: 'Closed' })).toBe(false)
  })
})
