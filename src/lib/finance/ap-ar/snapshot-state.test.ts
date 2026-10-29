import { describe, expect, it } from 'vitest'
import { isSnapshotStale } from './snapshot-state'

const NOW = Date.parse('2026-10-29T10:00:00Z')

describe('isSnapshotStale', () => {
  it('is fresh when built today and refreshed within the limit', () => {
    expect(isSnapshotStale({ checkedAt: '2026-10-29T09:55:00Z', asOfDate: '2026-10-29' }, NOW, '2026-10-29', 10)).toBe(false)
  })

  it('is stale when it describes an earlier day, however recent the refresh', () => {
    expect(isSnapshotStale({ checkedAt: '2026-10-29T09:59:00Z', asOfDate: '2026-10-28' }, NOW, '2026-10-29', 10)).toBe(true)
  })

  it('is stale after three refresh intervals (minimum 30 minutes)', () => {
    expect(isSnapshotStale({ checkedAt: '2026-10-29T09:35:00Z', asOfDate: '2026-10-29' }, NOW, '2026-10-29', 10)).toBe(false) // 25 min
    expect(isSnapshotStale({ checkedAt: '2026-10-29T09:25:00Z', asOfDate: '2026-10-29' }, NOW, '2026-10-29', 10)).toBe(true) // 35 min
    expect(isSnapshotStale({ checkedAt: '2026-10-29T08:50:00Z', asOfDate: '2026-10-29' }, NOW, '2026-10-29', 30)).toBe(false) // 70 min < 90
    expect(isSnapshotStale({ checkedAt: '2026-10-29T08:20:00Z', asOfDate: '2026-10-29' }, NOW, '2026-10-29', 30)).toBe(true) // 100 min
  })
})
