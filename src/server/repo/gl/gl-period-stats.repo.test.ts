import { beforeEach, describe, expect, it, vi } from 'vitest'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))
const hasCanceledMock = vi.fn()
vi.mock('~/server/db/gl-columns', () => ({ glTableHasCanceledDate: (...args: unknown[]) => hasCanceledMock(...args) }))

const { glPeriodStats } = await import('./gl-period-stats.repo')

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
