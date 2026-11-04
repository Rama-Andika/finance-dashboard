import { describe, expect, it } from 'vitest'
import {
  DEEP_REBUILD_MS,
  OLDER_CHECK_MS,
  periodKey,
  statsKey,
  verifyDecision,
  type BuiltPeriodState,
} from './period-fingerprint'

const period = { tableName: 'gl', startDate: '2026-09-01', endDate: '2026-09-30', type: 0 as const }
const NOW = Date.parse('2026-11-04T10:00:00Z')

const built = (patch: Partial<BuiltPeriodState> = {}): BuiltPeriodState => ({
  periodKey: periodKey(period),
  statsKey: '10:99:10:0',
  builtAtMs: NOW - 60_000,
  checkedAtMs: NOW - 60_000,
  ...patch,
})

describe('periodKey / statsKey', () => {
  it('builds stable text from the period row and from the journal counts', () => {
    expect(periodKey(period)).toBe('gl|2026-09-01|2026-09-30|0')
    expect(statsKey({ journals: '10', maxGlId: '99', posted: '9', canceled: '1' })).toBe('10:99:9:1')
  })

  it('changes when the GL table or a date changes', () => {
    expect(periodKey({ ...period, tableName: 'gl_2025' })).not.toBe(periodKey(period))
    expect(periodKey({ ...period, endDate: '2026-10-01' })).not.toBe(periodKey(period))
  })
})

describe('verifyDecision', () => {
  const decide = (b: BuiltPeriodState, isNewest: boolean) => verifyDecision({ period, built: b, isNewest, nowMs: NOW })

  it('rebuilds a period that was built before fingerprints existed', () => {
    expect(decide(built({ periodKey: null }), false)).toBe('rebuild')
    expect(decide(built({ statsKey: null }), false)).toBe('rebuild')
  })

  it('rebuilds when the period row changed', () => {
    expect(decide(built({ periodKey: 'gl|2026-09-01|2026-09-29|0' }), false)).toBe('rebuild')
  })

  it('rebuilds a newest period built more than a day ago, but only compares counts when it is younger', () => {
    expect(decide(built({ builtAtMs: NOW - DEEP_REBUILD_MS - 1 }), true)).toBe('rebuild')
    expect(decide(built({ builtAtMs: NOW - DEEP_REBUILD_MS + 1000 }), true)).toBe('check-stats')
    expect(decide(built({ builtAtMs: null }), true)).toBe('rebuild')
  })

  it('compares counts of an older period only when the last check is old enough', () => {
    expect(decide(built({ checkedAtMs: NOW - 1000 }), false)).toBe('keep')
    expect(decide(built({ checkedAtMs: NOW - OLDER_CHECK_MS }), false)).toBe('check-stats')
    expect(decide(built({ checkedAtMs: null }), false)).toBe('check-stats')
  })

  it('does not rebuild an older period just because it is old', () => {
    expect(decide(built({ builtAtMs: NOW - 10 * DEEP_REBUILD_MS, checkedAtMs: NOW - 1000 }), false)).toBe('keep')
  })
})
