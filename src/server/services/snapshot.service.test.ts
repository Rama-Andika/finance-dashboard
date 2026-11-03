import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  env: { DASH_REFRESH_ENABLED: '1', DASH_REFRESH_MINUTES: 10 },
  dashMigrationStatus: vi.fn(),
  getRefreshJob: vi.fn(),
  runRefreshCycle: vi.fn(),
  apArSnapshotInfo: vi.fn(),
  apArSnapshotProblem: vi.fn(),
}))

vi.mock('~/server/env', () => ({ env: mocks.env }))
vi.mock('~/server/context', () => ({ appToday: () => '2026-10-15' }))
vi.mock('~/server/dash/migrate', () => ({ dashMigrationStatus: mocks.dashMigrationStatus }))
vi.mock('~/server/dash/refresh-cycle', () => ({
  getRefreshJob: mocks.getRefreshJob,
  runRefreshCycle: mocks.runRefreshCycle,
}))
vi.mock('~/server/dash/snapshot', () => ({
  apArSnapshotInfo: mocks.apArSnapshotInfo,
  apArSnapshotProblem: mocks.apArSnapshotProblem,
}))

const { getSnapshotState, startSnapshotRefresh } = await import('./snapshot.service')

const idleJob = { running: false, lastOk: null, finishedRuns: 0 }

/** The AP/AR snapshot as the dash code reports it; the clock below is 09:10, so this one is ten minutes old. */
function snapshotInfo(overrides: { status?: 'ok' | 'running' | 'failed'; refreshedAt?: string } = {}) {
  return {
    asOfDate: '2026-10-15',
    refreshedAt: '2026-10-15T09:00:00Z',
    checkedAt: '2026-10-15T09:00:00Z',
    status: 'ok',
    rowCount: 10,
    durationMs: 1000,
    error: null,
    ...overrides,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.env.DASH_REFRESH_ENABLED = '1'
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-10-15T09:10:00Z'))
  mocks.dashMigrationStatus.mockResolvedValue({ total: 1, applied: 1, pending: [] })
  mocks.getRefreshJob.mockReturnValue(idleJob)
  mocks.apArSnapshotInfo.mockResolvedValue(snapshotInfo())
  mocks.apArSnapshotProblem.mockResolvedValue(null)
})

afterEach(() => {
  vi.useRealTimers()
})

describe('getSnapshotState', () => {
  it('returns the snapshot, the job of this process and whether the button may be shown', async () => {
    const job = { running: true, lastOk: false, finishedRuns: 3 }
    mocks.getRefreshJob.mockReturnValue(job)

    await expect(getSnapshotState()).resolves.toEqual({
      info: snapshotInfo(),
      problem: null,
      stale: false,
      job,
      canRefresh: true,
    })
  })

  it('hides the button when the snapshot tables do not exist', async () => {
    mocks.apArSnapshotInfo.mockResolvedValue(null)
    mocks.apArSnapshotProblem.mockResolvedValue('not-migrated')

    const state = await getSnapshotState()
    expect(state.canRefresh).toBe(false)
  })

  it('keeps the button when only the first snapshot is missing: that is how it gets built', async () => {
    mocks.apArSnapshotInfo.mockResolvedValue(null)
    mocks.apArSnapshotProblem.mockResolvedValue('not-refreshed')

    const state = await getSnapshotState()
    expect(state.canRefresh).toBe(true)
  })

  it('hides the button when the refresh is switched off', async () => {
    mocks.env.DASH_REFRESH_ENABLED = '0'

    const state = await getSnapshotState()
    expect(state.canRefresh).toBe(false)
  })
})

describe('startSnapshotRefresh', () => {
  it('starts a forced run of the shared cycle and answers at once', async () => {
    await expect(startSnapshotRefresh()).resolves.toEqual({ status: 'started' })
    expect(mocks.runRefreshCycle).toHaveBeenCalledTimes(1)
    expect(mocks.runRefreshCycle).toHaveBeenCalledWith('manual', { force: true })
  })

  it('starts when there is no snapshot yet', async () => {
    mocks.apArSnapshotInfo.mockResolvedValue(null)

    await expect(startSnapshotRefresh()).resolves.toEqual({ status: 'started' })
    expect(mocks.runRefreshCycle).toHaveBeenCalledTimes(1)
  })

  it('starts after a failed attempt even if that attempt was moments ago', async () => {
    mocks.apArSnapshotInfo.mockResolvedValue(snapshotInfo({ status: 'failed', refreshedAt: '2026-10-15T09:09:50Z' }))

    await expect(startSnapshotRefresh()).resolves.toEqual({ status: 'started' })
  })

  it('is unavailable when the refresh is switched off', async () => {
    mocks.env.DASH_REFRESH_ENABLED = '0'

    await expect(startSnapshotRefresh()).resolves.toEqual({ status: 'unavailable' })
    expect(mocks.runRefreshCycle).not.toHaveBeenCalled()
  })

  it('is unavailable while migrations are pending', async () => {
    mocks.dashMigrationStatus.mockResolvedValue({ total: 2, applied: 1, pending: ['0001_next'] })

    await expect(startSnapshotRefresh()).resolves.toEqual({ status: 'unavailable' })
    expect(mocks.runRefreshCycle).not.toHaveBeenCalled()
  })

  it('is unavailable when the migration status cannot be read', async () => {
    mocks.dashMigrationStatus.mockRejectedValue(new Error('migration folder not found'))

    await expect(startSnapshotRefresh()).resolves.toEqual({ status: 'unavailable' })
    expect(mocks.runRefreshCycle).not.toHaveBeenCalled()
  })

  it('reports a run that is already going, without touching the database', async () => {
    mocks.getRefreshJob.mockReturnValue({ running: true, lastOk: null, finishedRuns: 0 })

    await expect(startSnapshotRefresh()).resolves.toEqual({ status: 'already-running' })
    expect(mocks.dashMigrationStatus).not.toHaveBeenCalled()
    expect(mocks.runRefreshCycle).not.toHaveBeenCalled()
  })

  it('reports a run in another server process (the snapshot row says running)', async () => {
    mocks.apArSnapshotInfo.mockResolvedValue(snapshotInfo({ status: 'running' }))

    await expect(startSnapshotRefresh()).resolves.toEqual({ status: 'already-running' })
    expect(mocks.runRefreshCycle).not.toHaveBeenCalled()
  })

  it('refuses within the cooldown and says how long to wait', async () => {
    // rebuilt 30 seconds ago: 90 of the 120 seconds are left
    mocks.apArSnapshotInfo.mockResolvedValue(snapshotInfo({ refreshedAt: '2026-10-15T09:09:30Z' }))

    await expect(startSnapshotRefresh()).resolves.toEqual({ status: 'cooldown', retryAfterSeconds: 90 })
    expect(mocks.runRefreshCycle).not.toHaveBeenCalled()
  })

  it('does not start when another run began while the checks were running', async () => {
    mocks.getRefreshJob
      .mockReturnValueOnce(idleJob)
      .mockReturnValueOnce({ running: true, lastOk: null, finishedRuns: 0 })

    await expect(startSnapshotRefresh()).resolves.toEqual({ status: 'already-running' })
    expect(mocks.runRefreshCycle).not.toHaveBeenCalled()
  })
})
