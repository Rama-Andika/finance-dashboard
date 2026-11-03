import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dashMigrationStatus: vi.fn(),
  refreshApArSnapshot: vi.fn(),
  warmApArSnapshot: vi.fn(),
  refreshGlMonthlySnapshot: vi.fn(),
  refreshApArHistSnapshots: vi.fn(),
  clearCache: vi.fn(),
}))

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/cache', () => ({ clearCache: mocks.clearCache }))
vi.mock('./log', () => ({ dashLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))
vi.mock('./migrate', () => ({ dashMigrationStatus: mocks.dashMigrationStatus }))
vi.mock('./refresh-ap-ar', () => ({ refreshApArSnapshot: mocks.refreshApArSnapshot }))
vi.mock('./gl-snapshot', () => ({ refreshGlMonthlySnapshot: mocks.refreshGlMonthlySnapshot }))
vi.mock('./hist-ap-ar', () => ({ refreshApArHistSnapshots: mocks.refreshApArHistSnapshots }))
vi.mock('./snapshot', () => ({ warmApArSnapshot: mocks.warmApArSnapshot }))

const { getRefreshJob, runRefreshCycle } = await import('./refresh-cycle')

/** Every step finds nothing to do. */
function quietSteps() {
  mocks.dashMigrationStatus.mockResolvedValue({ total: 1, applied: 1, pending: [] })
  mocks.refreshApArSnapshot.mockResolvedValue({ ran: false, reason: 'unchanged' })
  mocks.warmApArSnapshot.mockResolvedValue(undefined)
  mocks.refreshGlMonthlySnapshot.mockResolvedValue({ ran: false, reason: 'nothing-to-do' })
  mocks.refreshApArHistSnapshots.mockResolvedValue({ ran: false, reason: 'nothing-to-do' })
}

beforeEach(() => {
  vi.resetAllMocks()
  globalThis.__dashRefreshJob = undefined
  quietSteps()
})

describe('runRefreshCycle', () => {
  it('runs the AP/AR snapshot, the GL snapshot and the history in that order', async () => {
    const order: string[] = []
    mocks.refreshApArSnapshot.mockImplementation(async () => {
      order.push('ap-ar')
      return { ran: false, reason: 'unchanged' }
    })
    mocks.warmApArSnapshot.mockImplementation(async () => {
      order.push('warm')
    })
    mocks.refreshGlMonthlySnapshot.mockImplementation(async () => {
      order.push('gl')
      return { ran: false, reason: 'nothing-to-do' }
    })
    mocks.refreshApArHistSnapshots.mockImplementation(async () => {
      order.push('history')
      return { ran: false, reason: 'nothing-to-do' }
    })

    await expect(runRefreshCycle('scheduler', { force: false })).resolves.toEqual({ ran: true, ok: true })
    expect(order).toEqual(['ap-ar', 'warm', 'gl', 'history'])
  })

  it('passes the force flag on and builds at most one history month per run', async () => {
    await runRefreshCycle('manual', { force: true })
    expect(mocks.refreshApArSnapshot).toHaveBeenLastCalledWith('2026-10-15', { force: true })
    expect(mocks.refreshApArHistSnapshots).toHaveBeenLastCalledWith('2026-10-15', { maxBuilds: 1 })

    await runRefreshCycle('scheduler', { force: false })
    expect(mocks.refreshApArSnapshot).toHaveBeenLastCalledWith('2026-10-15', { force: false })
  })

  it('forgets the cached history only when months were built or removed', async () => {
    await runRefreshCycle('scheduler', { force: false })
    expect(mocks.clearCache).not.toHaveBeenCalled()

    mocks.refreshApArHistSnapshots.mockResolvedValue({ ran: true, built: ['2026-09-30'], pruned: 0, durationMs: 1500 })
    await runRefreshCycle('scheduler', { force: false })
    expect(mocks.clearCache).toHaveBeenCalledWith('dash:ap-ar:hist')
  })

  it('records the outcome of a finished run', async () => {
    expect(getRefreshJob()).toEqual({ running: false, lastOk: null, finishedRuns: 0 })

    await runRefreshCycle('scheduler', { force: false })
    expect(getRefreshJob()).toEqual({ running: false, lastOk: true, finishedRuns: 1 })

    await runRefreshCycle('manual', { force: true })
    expect(getRefreshJob()).toEqual({ running: false, lastOk: true, finishedRuns: 2 })
  })

  it('refuses a second run while one is in progress', async () => {
    let finishApAr: () => void = () => {}
    mocks.refreshApArSnapshot.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishApAr = () => resolve({ ran: false, reason: 'unchanged' })
        }),
    )

    const first = runRefreshCycle('scheduler', { force: false })
    expect(getRefreshJob().running).toBe(true)
    await expect(runRefreshCycle('manual', { force: true })).resolves.toEqual({ ran: false, reason: 'already-running' })

    // the first run has to reach the AP/AR step before it can be finished
    await vi.waitFor(() => expect(mocks.refreshApArSnapshot).toHaveBeenCalledTimes(1))
    finishApAr()
    await expect(first).resolves.toEqual({ ran: true, ok: true })
    expect(getRefreshJob()).toEqual({ running: false, lastOk: true, finishedRuns: 1 })
  })

  it('skips the run and does not count it while migrations are pending', async () => {
    mocks.dashMigrationStatus.mockResolvedValue({ total: 2, applied: 1, pending: ['0001_next'] })

    await expect(runRefreshCycle('manual', { force: true })).resolves.toEqual({
      ran: false,
      reason: 'migrations-pending',
    })
    expect(mocks.refreshApArSnapshot).not.toHaveBeenCalled()
    expect(getRefreshJob()).toEqual({ running: false, lastOk: null, finishedRuns: 0 })
  })

  it('does not throw when a step fails: it records the failure and lets the next run start', async () => {
    mocks.refreshApArSnapshot.mockRejectedValue(new Error('connection lost'))

    await expect(runRefreshCycle('manual', { force: true })).resolves.toEqual({ ran: true, ok: false })
    expect(mocks.refreshGlMonthlySnapshot).not.toHaveBeenCalled()
    expect(getRefreshJob()).toEqual({ running: false, lastOk: false, finishedRuns: 1 })

    mocks.refreshApArSnapshot.mockResolvedValue({ ran: false, reason: 'unchanged' })
    await expect(runRefreshCycle('manual', { force: true })).resolves.toEqual({ ran: true, ok: true })
    expect(getRefreshJob()).toEqual({ running: false, lastOk: true, finishedRuns: 2 })
  })

  it('hands out a copy of the job state', () => {
    const copy = getRefreshJob()
    copy.running = true
    expect(getRefreshJob().running).toBe(false)
  })
})
