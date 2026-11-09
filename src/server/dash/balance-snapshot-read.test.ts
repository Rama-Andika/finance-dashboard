import { beforeEach, describe, expect, it, vi } from 'vitest'

const rowsMock = vi.fn()
vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/db/query', () => ({ rows: (...a: unknown[]) => rowsMock(...a), inList: () => '' }))

const { builtBalancePeriods, snapshotBalanceTotals } = await import('./balance-snapshot-read')
const { clearCache } = await import('~/server/cache')

beforeEach(() => {
  clearCache()
  rowsMock.mockReset()
})

describe('builtBalancePeriods', () => {
  it('lists the usable periods with a version made of the build time and the row count', async () => {
    rowsMock.mockResolvedValue([{ id: '7', builtAt: '2026-10-01T00:00:00Z', rowCount: 12 }])
    const built = await builtBalancePeriods()
    expect(Array.from(built)).toEqual([['7', '2026-10-01T00:00:00Z#12']])
  })

  it('is empty when the tables do not exist yet', async () => {
    rowsMock.mockRejectedValue(new Error("Table 'dash_snap_balance_periods' doesn't exist"))
    expect((await builtBalancePeriods()).size).toBe(0)
  })

  it('is read once for a while', async () => {
    rowsMock.mockResolvedValue([])
    await builtBalancePeriods()
    await builtBalancePeriods()
    expect(rowsMock).toHaveBeenCalledTimes(1)
  })
})

describe('snapshotBalanceTotals', () => {
  it('reads nothing for no periods or an empty entity list', async () => {
    expect((await snapshotBalanceTotals([], 'all')).size).toBe(0)
    expect((await snapshotBalanceTotals(['7'], [])).size).toBe(0)
    expect(rowsMock).not.toHaveBeenCalled()
  })

  it('gives the totals of every group per period', async () => {
    rowsMock.mockResolvedValue([
      { periodId: '7', groupKey: 'Liquid Assets', amount: '100.00' },
      { periodId: '7', groupKey: 'Equity', amount: '90.00' },
      { periodId: '7', groupKey: 'Profit', amount: '10.00' },
      { periodId: '8', groupKey: 'Liquid Assets', amount: '120.50' },
    ])
    const totals = await snapshotBalanceTotals(['7', '8'], 'all')
    expect(totals.get('7')).toEqual({ 'Liquid Assets': '100.00', Equity: '90.00', Profit: '10.00' })
    expect(totals.get('8')).toEqual({ 'Liquid Assets': '120.50' })
  })

  it('adds up rows of the same group that came from different slices', async () => {
    rowsMock.mockResolvedValue([
      { periodId: '7', groupKey: 'Equity', amount: '90.10' },
      { periodId: '7', groupKey: 'Equity', amount: '0.20' },
    ])
    expect((await snapshotBalanceTotals(['7'], 'all')).get('7')?.Equity).toBe('90.30')
  })
})
