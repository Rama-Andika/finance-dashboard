import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  dashMigrationStatus: vi.fn(),
  refreshApArSnapshot: vi.fn(),
  warmApArSnapshot: vi.fn(),
  refreshGlMonthlySnapshot: vi.fn(),
  refreshBalanceSnapshot: vi.fn(),
  refreshCashLinesSnapshot: vi.fn(),
  refreshApArHistSnapshots: vi.fn(),
  currentCashAccountIds: vi.fn(),
  clearCache: vi.fn(),
  clearCachesAfterPeriodChange: vi.fn(),
  logInfo: vi.fn(),
}))

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/cache', () => ({ clearCache: mocks.clearCache }))
vi.mock('./log', () => ({ dashLog: { info: mocks.logInfo, warn: vi.fn(), error: vi.fn() } }))
vi.mock('./migrate', () => ({ dashMigrationStatus: mocks.dashMigrationStatus }))
vi.mock('./refresh-ap-ar', () => ({ refreshApArSnapshot: mocks.refreshApArSnapshot }))
vi.mock('./gl-snapshot', () => ({ refreshGlMonthlySnapshot: mocks.refreshGlMonthlySnapshot }))
vi.mock('./balance-snapshot', () => ({ refreshBalanceSnapshot: mocks.refreshBalanceSnapshot }))
vi.mock('./cash-lines-build', () => ({ refreshCashLinesSnapshot: mocks.refreshCashLinesSnapshot }))
vi.mock('~/server/services/shared/cash-accounts', () => ({ currentCashAccountIds: mocks.currentCashAccountIds }))
vi.mock('./hist-ap-ar', () => ({ refreshApArHistSnapshots: mocks.refreshApArHistSnapshots }))
vi.mock('./snapshot', () => ({ warmApArSnapshot: mocks.warmApArSnapshot }))
vi.mock('./invalidate', () => ({ clearCachesAfterPeriodChange: mocks.clearCachesAfterPeriodChange }))

const { getRefreshJob, runRefreshCycle } = await import('./refresh-cycle')

/** Every step finds nothing to do. */
function quietSteps() {
  mocks.dashMigrationStatus.mockResolvedValue({ total: 1, applied: 1, pending: [] })
  mocks.refreshApArSnapshot.mockResolvedValue({ ran: false, reason: 'unchanged' })
  mocks.warmApArSnapshot.mockResolvedValue(undefined)
  mocks.refreshGlMonthlySnapshot.mockResolvedValue({ ran: false, reason: 'nothing-to-do' })
  mocks.refreshBalanceSnapshot.mockResolvedValue({ ran: false, reason: 'nothing-to-do' })
  mocks.currentCashAccountIds.mockResolvedValue(['11', '12'])
  mocks.refreshCashLinesSnapshot.mockResolvedValue({ ran: false, reason: 'nothing-to-do' })
  mocks.refreshApArHistSnapshots.mockResolvedValue({ ran: false, reason: 'nothing-to-do' })
}

beforeEach(() => {
  vi.resetAllMocks()
  globalThis.__dashRefreshJob = undefined
  quietSteps()
})

describe('runRefreshCycle', () => {
  it('runs the AP/AR snapshot, the GL snapshot, the balance snapshot, the cash lines and the history in that order', async () => {
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
    mocks.refreshBalanceSnapshot.mockImplementation(async () => {
      order.push('balance')
      return { ran: false, reason: 'nothing-to-do' }
    })
    mocks.refreshCashLinesSnapshot.mockImplementation(async () => {
      order.push('cash')
      return { ran: false, reason: 'nothing-to-do' }
    })
    mocks.refreshApArHistSnapshots.mockImplementation(async () => {
      order.push('history')
      return { ran: false, reason: 'nothing-to-do' }
    })

    await expect(runRefreshCycle('scheduler', { force: false })).resolves.toEqual({ ran: true, ok: true })
    expect(order).toEqual(['ap-ar', 'warm', 'gl', 'balance', 'cash', 'history'])
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

  it('forgets cached answers when a snapshot period was rebuilt or removed', async () => {
    mocks.refreshGlMonthlySnapshot.mockResolvedValue({ ran: true, built: 1, rebuilt: 1, removed: 0, durationMs: 5 })
    await runRefreshCycle('scheduler', { force: false })
    expect(mocks.clearCachesAfterPeriodChange).toHaveBeenCalledTimes(1)
  })

  it('keeps cached answers when the GL snapshot only gained new periods', async () => {
    mocks.refreshGlMonthlySnapshot.mockResolvedValue({ ran: true, built: 2, rebuilt: 0, removed: 0, durationMs: 5 })
    await runRefreshCycle('scheduler', { force: false })
    expect(mocks.clearCachesAfterPeriodChange).not.toHaveBeenCalled()
  })

  it('keeps going when the cash-lines snapshot fails: later steps still run and the failure is recorded', async () => {
    mocks.refreshCashLinesSnapshot.mockRejectedValue(new Error('strict mode refused a row'))

    await expect(runRefreshCycle('scheduler', { force: false })).resolves.toEqual({ ran: true, ok: false })
    expect(mocks.refreshApArHistSnapshots).toHaveBeenCalledTimes(1)
    expect(getRefreshJob()).toEqual({ running: false, lastOk: false, finishedRuns: 1 })
  })

  it('keeps going when the balance snapshot fails: later steps still run and the failure is recorded', async () => {
    mocks.refreshBalanceSnapshot.mockRejectedValue(new Error('strict mode refused a row'))

    await expect(runRefreshCycle('scheduler', { force: false })).resolves.toEqual({ ran: true, ok: false })
    expect(mocks.refreshCashLinesSnapshot).toHaveBeenCalledTimes(1)
    expect(mocks.refreshApArHistSnapshots).toHaveBeenCalledTimes(1)
    expect(getRefreshJob()).toEqual({ running: false, lastOk: false, finishedRuns: 1 })
  })

  it('forgets cached answers when a balance snapshot period was rebuilt, but not when it only gained periods', async () => {
    mocks.refreshBalanceSnapshot.mockResolvedValue({ ran: true, built: 2, rebuilt: 0, removed: 0, durationMs: 5 })
    await runRefreshCycle('scheduler', { force: false })
    expect(mocks.clearCachesAfterPeriodChange).not.toHaveBeenCalled()

    mocks.refreshBalanceSnapshot.mockResolvedValue({ ran: true, built: 1, rebuilt: 1, removed: 0, durationMs: 5 })
    await runRefreshCycle('scheduler', { force: false })
    expect(mocks.clearCachesAfterPeriodChange).toHaveBeenCalledTimes(1)
  })

  it('hands the current cash accounts to the cash-lines snapshot and forgets caches after a rebuild', async () => {
    mocks.refreshCashLinesSnapshot.mockResolvedValue({ ran: true, built: 1, rebuilt: 1, removed: 0, durationMs: 5 })
    await runRefreshCycle('scheduler', { force: false })
    expect(mocks.refreshCashLinesSnapshot).toHaveBeenCalledWith(['11', '12'])
    expect(mocks.clearCachesAfterPeriodChange).toHaveBeenCalledTimes(1)
  })

  it('forgets cached metrics after a manual refresh, but not after a scheduled one', async () => {
    await runRefreshCycle('manual', { force: true })
    expect(mocks.clearCache).toHaveBeenCalledWith('metric:')
    mocks.clearCache.mockClear()
    await runRefreshCycle('scheduler', { force: false })
    expect(mocks.clearCache).not.toHaveBeenCalledWith('metric:')
  })

  it('makes a manual refresh look at the ERP again instead of reusing the period counts of the last cycle', async () => {
    await runRefreshCycle('manual', { force: true })
    expect(mocks.clearCache).toHaveBeenCalledWith('dash:period-stats:')
    mocks.clearCache.mockClear()
    await runRefreshCycle('scheduler', { force: false })
    expect(mocks.clearCache).not.toHaveBeenCalledWith('dash:period-stats:')
  })
})

describe('timing of the steps', () => {
  const infoLines = () => mocks.logInfo.mock.calls.map((call) => String(call[0]))

  it('says which step a manual refresh is in, and sums up where the time went', async () => {
    await runRefreshCycle('manual', { force: true })

    const lines = infoLines()
    for (const step of [
      'AP/AR snapshot',
      'warm invoice lists',
      'GL snapshot',
      'balance snapshot',
      'cash lines snapshot',
      'AP/AR history',
    ]) {
      expect(lines).toContain(`manual refresh: ${step} started`)
    }
    const summary = lines.find((line) => line.startsWith('refresh cycle (manual) finished in'))
    expect(summary).toBeDefined()
    for (const step of [
      'AP/AR snapshot',
      'warm invoice lists',
      'GL snapshot',
      'balance snapshot',
      'cash lines snapshot',
      'AP/AR history',
    ]) {
      expect(summary).toContain(step)
    }
  })

  it('stays quiet about a scheduled run that finished at once', async () => {
    await runRefreshCycle('scheduler', { force: false })

    expect(infoLines().filter((line) => line.startsWith('refresh cycle') || line.startsWith('manual refresh'))).toEqual(
      [],
    )
  })

  it('reports a scheduled run that failed, with the steps up to the failure', async () => {
    mocks.refreshApArSnapshot.mockRejectedValue(new Error('connection lost'))

    await runRefreshCycle('scheduler', { force: false })

    const summary = infoLines().find((line) => line.startsWith('refresh cycle (scheduler) finished with errors'))
    expect(summary).toContain('AP/AR snapshot')
    expect(summary).not.toContain('GL snapshot')
  })

  it('logs the AP/AR rebuild right after it, with its own steps, not at the end of the run', async () => {
    const order: string[] = []
    mocks.refreshApArSnapshot.mockResolvedValue({
      ran: true,
      asOfDate: '2026-10-15',
      openRows: 3,
      unallocatedRows: 1,
      durationMs: 670_000,
      steps: [{ name: 'ap: invoices scan', ms: 120_000 }],
    })
    mocks.refreshGlMonthlySnapshot.mockImplementation(async () => {
      order.push('gl')
      return { ran: false, reason: 'nothing-to-do' }
    })
    mocks.logInfo.mockImplementation((line: string) => {
      if (line.startsWith('AP/AR snapshot refreshed')) order.push('ap-ar logged')
    })

    await runRefreshCycle('scheduler', { force: false })

    expect(order).toEqual(['ap-ar logged', 'gl'])
    expect(infoLines()).toContain(
      'AP/AR snapshot refreshed in 11m 10s (3 open invoices, 1 unallocated): ap: invoices scan 2m 0s',
    )
  })
})

describe('what a run logs and clears around its steps', () => {
  const infoLines = () => mocks.logInfo.mock.calls.map((call) => String(call[0]))

  it('says that a manual run started before its first step, and says nothing of the kind for a scheduled run', async () => {
    await runRefreshCycle('manual', { force: true })
    expect(infoLines().slice(0, 2)).toEqual([
      'manual snapshot refresh started',
      'manual refresh: AP/AR snapshot started',
    ])

    mocks.logInfo.mockClear()
    await runRefreshCycle('scheduler', { force: false })
    expect(infoLines()).not.toContain('manual snapshot refresh started')
  })

  it('logs what the GL, cash lines and history steps built', async () => {
    mocks.refreshGlMonthlySnapshot.mockResolvedValue({ ran: true, built: 2, rebuilt: 1, removed: 0, durationMs: 5 })
    mocks.refreshCashLinesSnapshot.mockResolvedValue({ ran: true, built: 1, rebuilt: 0, removed: 3, durationMs: 2600 })
    mocks.refreshApArHistSnapshots.mockResolvedValue({ ran: true, built: ['2026-09-30'], pruned: 2, durationMs: 1500 })

    await runRefreshCycle('scheduler', { force: false })

    expect(infoLines()).toEqual(
      expect.arrayContaining([
        'GL snapshot built 2 period(s) (1 rebuilt), removed 0 in 0s',
        'cash lines snapshot built 1 period(s) (0 rebuilt), removed 3 in 3s',
        'AP/AR history built 1 month(s), removed 2 in 2s',
      ]),
    )
  })

  it('forgets the cached metrics only after the last step of a manual run', async () => {
    const order: string[] = []
    mocks.refreshApArHistSnapshots.mockImplementation(async () => {
      order.push('history')
      return { ran: false, reason: 'nothing-to-do' }
    })
    mocks.clearCache.mockImplementation((prefix: string) => {
      order.push(`clear ${prefix}`)
    })

    await runRefreshCycle('manual', { force: true })

    expect(order).toEqual(['history', 'clear metric:', 'clear dash:period-stats:'])
  })

  it('records a failing history step as a failed run and does not forget the cached metrics', async () => {
    mocks.refreshApArHistSnapshots.mockRejectedValue(new Error('connection lost'))

    await expect(runRefreshCycle('manual', { force: true })).resolves.toEqual({ ran: true, ok: false })
    expect(getRefreshJob()).toEqual({ running: false, lastOk: false, finishedRuns: 1 })
    expect(mocks.clearCache).not.toHaveBeenCalledWith('metric:')
  })
})
