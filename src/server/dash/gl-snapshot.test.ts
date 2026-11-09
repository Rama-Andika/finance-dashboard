import { beforeEach, describe, expect, it, vi } from 'vitest'

const rowsMock = vi.fn()
vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/db/query', () => ({ rows: (...a: unknown[]) => rowsMock(...a) }))
vi.mock('./closed-period-refresh', () => ({ refreshClosedPeriods: vi.fn() }))
vi.mock('~/server/repo/gl/gl-period-stats.repo', () => ({ glPeriodStats: vi.fn() }))

const { snapshotMovements } = await import('./gl-snapshot')

describe('snapshotMovements', () => {
  beforeEach(() => {
    rowsMock.mockReset()
  })

  it('reads nothing for no periods or an empty entity list', async () => {
    expect(await snapshotMovements([], { segIds: 'all' })).toEqual([])
    expect(await snapshotMovements(['1'], { segIds: [] })).toEqual([])
    expect(rowsMock).not.toHaveBeenCalled()
  })

  it('reads the slices of a long period list together and keeps the order of the slices', async () => {
    let call = 0
    let running = 0
    let peak = 0
    rowsMock.mockImplementation(async () => {
      const n = (call += 1)
      running += 1
      peak = Math.max(peak, running)
      // the first slice answers last: the result must still list it first
      await new Promise((resolve) => setTimeout(resolve, (4 - n) * 10))
      running -= 1
      return [{ coaId: `c${n}`, periodId: '1', debet: '1.00', credit: '0.00' }]
    })

    const periodIds = Array.from({ length: 2500 }, (_, i) => String(i + 1)) // 3 slices of at most 1,000
    const result = await snapshotMovements(periodIds, { segIds: 'all' })

    expect(rowsMock).toHaveBeenCalledTimes(3)
    expect(peak).toBeGreaterThan(1)
    expect(result.map((r) => r.coaId)).toEqual(['c1', 'c2', 'c3'])
  })

  it('shapes the rows like the ERP query does', async () => {
    rowsMock.mockResolvedValue([{ coaId: 5, periodId: 7, locationId: 9, debet: '10.00', credit: '2.50' }])
    expect(await snapshotMovements(['7'], { segIds: 'all', byLocation: true })).toEqual([
      { coaId: '5', periodId: '7', locationId: '9', debet: '10.00', credit: '2.50' },
    ])
  })
})
