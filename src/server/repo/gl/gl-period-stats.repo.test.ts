import { beforeEach, describe, expect, it, vi } from 'vitest'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))
const hasCanceledMock = vi.fn()
vi.mock('~/server/db/gl-columns', () => ({ glTableHasCanceledDate: (...args: unknown[]) => hasCanceledMock(...args) }))

const { glPeriodStats, glPeriodStatsOfTable, glPeriodStatsSharedMany } = await import('./gl-period-stats.repo')
const { clearCache } = await import('~/server/cache')
const { PERIOD_STATS_CACHE_PREFIX } = await import('~/server/dash/tables')

describe('glPeriodStats', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    hasCanceledMock.mockReset()
    hasCanceledMock.mockResolvedValue(true)
  })

  it('returns the counts as strings', async () => {
    rowsMock.mockResolvedValue([{ journals: '12', maxGlId: '3456', posted: '11', canceled: '1' }])
    expect(await glPeriodStats({ periodeId: '7', tableName: 'gl' })).toEqual({
      journals: '12',
      maxGlId: '3456',
      posted: '11',
      canceled: '1',
    })
  })

  it('treats an empty period (null aggregates or no row) as zeros', async () => {
    rowsMock.mockResolvedValue([{ journals: 0, maxGlId: null, posted: null, canceled: null }])
    expect(await glPeriodStats({ periodeId: '7', tableName: 'gl_2020' })).toEqual({
      journals: '0',
      maxGlId: '0',
      posted: '0',
      canceled: '0',
    })
    rowsMock.mockResolvedValue([])
    expect((await glPeriodStats({ periodeId: '7', tableName: 'gl' })).journals).toBe('0')
  })

  it('still works for a GL table without a canceled_date column', async () => {
    hasCanceledMock.mockResolvedValue(false)
    rowsMock.mockResolvedValue([{ journals: '3', maxGlId: '30', posted: '3', canceled: '0' }])
    expect((await glPeriodStats({ periodeId: '7', tableName: 'gl' })).canceled).toBe('0')
  })

  it('rejects a table name that is not a GL table', async () => {
    await expect(glPeriodStats({ periodeId: '7', tableName: 'coa; x' })).rejects.toThrow('Unknown GL table name')
    expect(rowsMock).not.toHaveBeenCalled()
  })
})

describe('glPeriodStatsOfTable', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    hasCanceledMock.mockReset()
    hasCanceledMock.mockResolvedValue(true)
  })

  it('reads the counts of several periods with one grouped query', async () => {
    rowsMock.mockResolvedValue([
      { periodId: '7', journals: '12', maxGlId: '3456', posted: '11', canceled: '1' },
      { periodId: '8', journals: '3', maxGlId: '30', posted: '3', canceled: '0' },
    ])
    const result = await glPeriodStatsOfTable('gl', ['7', '8'])
    expect(rowsMock).toHaveBeenCalledTimes(1)
    expect(result.get('7')).toEqual({ journals: '12', maxGlId: '3456', posted: '11', canceled: '1' })
    expect(result.get('8')).toEqual({ journals: '3', maxGlId: '30', posted: '3', canceled: '0' })
  })

  it('gives all zeros to a period that has no journals (it is not in the answer)', async () => {
    rowsMock.mockResolvedValue([{ periodId: '7', journals: '12', maxGlId: '3456', posted: '11', canceled: '1' }])
    const result = await glPeriodStatsOfTable('gl_2020', ['7', '9'])
    expect(result.get('9')).toEqual({ journals: '0', maxGlId: '0', posted: '0', canceled: '0' })
  })

  it('asks for the periods in slices of 1,000', async () => {
    rowsMock.mockResolvedValue([])
    const ids = Array.from({ length: 1001 }, (_, i) => String(i + 1))
    await glPeriodStatsOfTable('gl', ids)
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })

  it('does not ask the database for an empty list, and rejects a table that is not a GL table', async () => {
    expect((await glPeriodStatsOfTable('gl', [])).size).toBe(0)
    expect(rowsMock).not.toHaveBeenCalled()
    await expect(glPeriodStatsOfTable('coa; x', ['7'])).rejects.toThrow('Unknown GL table name')
  })
})

describe('glPeriodStatsSharedMany', () => {
  const row = (periodId: string) => ({ periodId, journals: '12', maxGlId: '3456', posted: '11', canceled: '1' })
  const GL_7 = { periodeId: '7', tableName: 'gl' }
  const GL_8 = { periodeId: '8', tableName: 'gl' }
  const GL2020_7 = { periodeId: '7', tableName: 'gl_2020' }

  beforeEach(() => {
    clearCache()
    rowsMock.mockReset()
    hasCanceledMock.mockReset()
    hasCanceledMock.mockResolvedValue(true)
    rowsMock.mockResolvedValue([row('7'), row('8')])
  })

  it('reads all the periods of one table with one query, whatever their number', async () => {
    const result = await glPeriodStatsSharedMany([GL_7, GL_8])
    expect(rowsMock).toHaveBeenCalledTimes(1)
    expect(result.get('7')).toMatchObject({ journals: '12' })
    expect(result.get('8')).toMatchObject({ journals: '12' })
  })

  it('uses one query per GL table', async () => {
    await glPeriodStatsSharedMany([GL_7, GL_8, GL2020_7])
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })

  it('asks the ERP once for the same period, however many steps check it', async () => {
    const first = await glPeriodStatsSharedMany([GL_7])
    const second = await glPeriodStatsSharedMany([GL_7])
    expect(second).toEqual(first)
    expect(rowsMock).toHaveBeenCalledTimes(1)
  })

  it('reads only the table that still has periods outside the memory', async () => {
    await glPeriodStatsSharedMany([GL_7])
    rowsMock.mockClear()
    await glPeriodStatsSharedMany([GL_7, GL2020_7])
    expect(rowsMock).toHaveBeenCalledTimes(1) // gl_2020 only; period 7 of gl comes from the memory
  })

  it('asks again after the cycle forgets the counts (a manual refresh)', async () => {
    await glPeriodStatsSharedMany([GL_7])
    clearCache(PERIOD_STATS_CACHE_PREFIX)
    await glPeriodStatsSharedMany([GL_7])
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })

  it('does not remember a failed read', async () => {
    rowsMock.mockRejectedValueOnce(new Error('connection lost'))
    await expect(glPeriodStatsSharedMany([GL_7])).rejects.toThrow('connection lost')
    const retry = await glPeriodStatsSharedMany([GL_7])
    expect(retry.get('7')).toMatchObject({ journals: '12' })
  })

  it('answers with an empty map for an empty list, without a query', async () => {
    expect((await glPeriodStatsSharedMany([])).size).toBe(0)
    expect(rowsMock).not.toHaveBeenCalled()
  })

  it('is not what a build reads: the plain function always asks the ERP', async () => {
    rowsMock.mockResolvedValue([{ journals: '12', maxGlId: '3456', posted: '11', canceled: '1' }])
    await glPeriodStats({ periodeId: '7', tableName: 'gl' })
    await glPeriodStats({ periodeId: '7', tableName: 'gl' })
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })
})
