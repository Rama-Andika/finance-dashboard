import { beforeEach, describe, expect, it, vi } from 'vitest'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args), inList: () => '' }))

const { countOpeningRows, openingBalances } = await import('./gl-opening.repo')
const { clearCache } = await import('~/server/cache')

const base = { periodeId: 'p1', segCol: 'segment1_id', segIds: 'all' as const, coaIds: ['1', '2'] }

describe('countOpeningRows', () => {
  beforeEach(() => {
    clearCache()
    rowsMock.mockReset()
    rowsMock.mockResolvedValue([{ n: '3' }])
  })

  it('asks the database once per period for a while', async () => {
    expect(await countOpeningRows('p1')).toBe(3)
    expect(await countOpeningRows('p1')).toBe(3)
    expect(rowsMock).toHaveBeenCalledTimes(1)
    await countOpeningRows('p2')
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })

  it('reads again after the cache was cleared', async () => {
    await countOpeningRows('p1')
    clearCache()
    await countOpeningRows('p1')
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })
})

describe('openingBalances', () => {
  beforeEach(() => {
    clearCache()
    rowsMock.mockReset()
    rowsMock.mockResolvedValue([{ coaId: '1', opening: '10.00' }])
  })

  it('reads the same opening balances once, however many callers ask', async () => {
    const [a, b] = await Promise.all([openingBalances(base), openingBalances({ ...base, coaIds: ['1', '2'] })])
    expect(a).toEqual([{ coaId: '1', segmentDetailId: undefined, opening: '10.00' }])
    expect(b).toBe(a)
    expect(rowsMock).toHaveBeenCalledTimes(1)
  })

  it('treats a different period, account list or split as another read', async () => {
    await openingBalances(base)
    await openingBalances({ ...base, periodeId: 'p2' })
    await openingBalances({ ...base, coaIds: ['1', '3'] })
    await openingBalances({ ...base, bySegment: true })
    await openingBalances({ ...base, segIds: ['s1'] })
    expect(rowsMock).toHaveBeenCalledTimes(5)
  })

  it('reads nothing for an empty account list or an empty entity list', async () => {
    expect(await openingBalances({ ...base, coaIds: [] })).toEqual([])
    expect(await openingBalances({ ...base, segIds: [] })).toEqual([])
    expect(rowsMock).not.toHaveBeenCalled()
  })

  it('refuses an entity segment column other than segment1_id', async () => {
    await expect(openingBalances({ ...base, segCol: 'segment2_id' })).rejects.toThrow('segment1_id')
    expect(rowsMock).not.toHaveBeenCalled()
  })
})
