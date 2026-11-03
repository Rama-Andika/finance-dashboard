import { describe, expect, it } from 'vitest'
import {
  isSnapshotRefreshing,
  isSnapshotStale,
  manualRefreshGate,
  MANUAL_REFRESH_COOLDOWN_MS,
  snapshotPollInterval,
  SNAPSHOT_POLL_IDLE_MS,
  SNAPSHOT_POLL_RUNNING_MS,
} from './snapshot-state'

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

describe('manualRefreshGate', () => {
  const rebuilt = (refreshedAt: string) => ({ status: 'ok' as const, refreshedAt })

  it('uses a cooldown of two minutes', () => {
    expect(MANUAL_REFRESH_COOLDOWN_MS).toBe(120_000)
  })

  it('allows a refresh when there is no snapshot yet', () => {
    expect(manualRefreshGate(null, NOW)).toEqual({ allowed: true })
  })

  it('refuses within the cooldown and says how many seconds are left', () => {
    expect(manualRefreshGate(rebuilt('2026-10-29T09:59:30Z'), NOW)).toEqual({ allowed: false, retryAfterSeconds: 90 })
  })

  it('rounds the remaining time up to whole seconds', () => {
    // rebuilt 119.5 s ago: half a second is left
    expect(manualRefreshGate(rebuilt('2026-10-29T09:58:00.500Z'), NOW)).toEqual({ allowed: false, retryAfterSeconds: 1 })
  })

  it('allows a refresh once the cooldown has passed, exactly at the limit too', () => {
    expect(manualRefreshGate(rebuilt('2026-10-29T09:58:00Z'), NOW)).toEqual({ allowed: true }) // 120 s
    expect(manualRefreshGate(rebuilt('2026-10-29T09:00:00Z'), NOW)).toEqual({ allowed: true }) // 60 min
  })

  it('allows a retry right after a failed attempt', () => {
    expect(manualRefreshGate({ status: 'failed', refreshedAt: '2026-10-29T09:59:50Z' }, NOW)).toEqual({ allowed: true })
  })

  it('uses the cooldown it is given', () => {
    expect(manualRefreshGate(rebuilt('2026-10-29T09:59:30Z'), NOW, 20_000)).toEqual({ allowed: true })
    expect(manualRefreshGate(rebuilt('2026-10-29T09:59:30Z'), NOW, 60_000)).toEqual({ allowed: false, retryAfterSeconds: 30 })
  })

  it('never blocks on a time it cannot read', () => {
    expect(manualRefreshGate(rebuilt('not a date'), NOW)).toEqual({ allowed: true })
  })
})

describe('isSnapshotRefreshing / snapshotPollInterval', () => {
  const idle = { info: { status: 'ok' as const }, job: { running: false } }

  it('is not refreshing before the first state has arrived', () => {
    expect(isSnapshotRefreshing(undefined)).toBe(false)
    expect(snapshotPollInterval(undefined)).toBe(SNAPSHOT_POLL_IDLE_MS)
  })

  it('is not refreshing when nothing runs and the snapshot is fine, or missing', () => {
    expect(isSnapshotRefreshing(idle)).toBe(false)
    expect(isSnapshotRefreshing({ info: null, job: { running: false } })).toBe(false)
    expect(isSnapshotRefreshing({ info: { status: 'failed' }, job: { running: false } })).toBe(false)
  })

  it('is refreshing while the job of this process runs', () => {
    expect(isSnapshotRefreshing({ info: { status: 'ok' }, job: { running: true } })).toBe(true)
    expect(isSnapshotRefreshing({ info: null, job: { running: true } })).toBe(true)
  })

  it('is refreshing while the snapshot row says running (another process is rebuilding)', () => {
    expect(isSnapshotRefreshing({ info: { status: 'running' }, job: { running: false } })).toBe(true)
  })

  it('polls every few seconds while refreshing and once a minute otherwise', () => {
    expect(snapshotPollInterval({ info: { status: 'ok' }, job: { running: true } })).toBe(SNAPSHOT_POLL_RUNNING_MS)
    expect(snapshotPollInterval(idle)).toBe(SNAPSHOT_POLL_IDLE_MS)
    expect(SNAPSHOT_POLL_RUNNING_MS).toBeLessThan(SNAPSHOT_POLL_IDLE_MS)
  })
})
