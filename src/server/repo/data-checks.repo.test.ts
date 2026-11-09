import { beforeEach, describe, expect, it, vi } from 'vitest'

const rowsMock = vi.fn()
vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/db/query', () => ({ rows: (...a: unknown[]) => rowsMock(...a), inList: () => '' }))
vi.mock('~/server/dash/snapshot', () => ({
  apArSnapshotCovers: async () => false,
  snapshotIgnoredReceipts: async () => ({ count: 0, amount: '0.00' }),
}))

const { checkCardsWithInvalidLocation } = await import('./data-checks.repo')
const { clearCache } = await import('~/server/cache')

describe('checkCardsWithInvalidLocation', () => {
  beforeEach(() => {
    clearCache()
    rowsMock.mockReset()
    rowsMock.mockResolvedValue([{ n: '4' }])
  })

  it('counts the cards with an unknown location', async () => {
    expect(await checkCardsWithInvalidLocation()).toBe(4)
  })

  it('reads the database once for a while, however often and from however many pages it is asked', async () => {
    await Promise.all([checkCardsWithInvalidLocation(), checkCardsWithInvalidLocation()])
    await checkCardsWithInvalidLocation()
    expect(rowsMock).toHaveBeenCalledTimes(1)
  })

  it('reads again after the cache was cleared', async () => {
    await checkCardsWithInvalidLocation()
    clearCache('dataChecks:')
    await checkCardsWithInvalidLocation()
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })
})
