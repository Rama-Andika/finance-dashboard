import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Period } from '~/lib/finance/types'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))

const { movementsByPeriods } = await import('./gl.repo')
const { glMovementsCache } = await import('~/server/cache')

const period = (periodeId: string, status: Period['status'] = 'Closed'): Period => ({
  periodeId,
  name: periodeId,
  startDate: '2024-01-01',
  endDate: '2024-01-31',
  status,
  type: 0,
  tableName: 'gl',
})

describe('movementsByPeriods query budget', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    glMovementsCache.clear()
  })

  it('reads all uncached closed periods of a table with ONE query, then serves them from cache', async () => {
    rowsMock.mockResolvedValue([
      { coaId: '10', periodId: 'p1', debet: '100', credit: '0' },
      { coaId: '10', periodId: 'p2', debet: '50', credit: '0' },
      { coaId: '10', periodId: 'p3', debet: '1', credit: '0' },
    ])
    const opts = {
      periods: [period('p1'), period('p2'), period('p3')],
      segCol: 'segment1_id',
      segIds: 'all' as const,
      coaIds: ['10'],
    }

    const first = await movementsByPeriods(opts)
    expect(rowsMock).toHaveBeenCalledTimes(1)
    expect(first).toEqual([{ coaId: '10', periodId: undefined, locationId: undefined, debet: '151.00', credit: '0.00' }])

    const second = await movementsByPeriods({ ...opts, byPeriod: true })
    expect(rowsMock).toHaveBeenCalledTimes(1)
    expect(second.map((r) => [r.periodId, r.debet]).sort()).toEqual([
      ['p1', '100.00'],
      ['p2', '50.00'],
      ['p3', '1.00'],
    ])
  })

  it('never caches open periods', async () => {
    rowsMock.mockResolvedValue([{ coaId: '10', periodId: 'p9', debet: '5', credit: '0' }])
    const opts = { periods: [period('p9', 'Open')], segCol: 'segment1_id', segIds: 'all' as const, byPeriod: true }
    await movementsByPeriods(opts)
    await movementsByPeriods(opts)
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })

  it('rejects a segment column that is not segmentN_id', async () => {
    await expect(
      movementsByPeriods({ periods: [period('p1')], segCol: 'coa_id', segIds: 'all' }),
    ).rejects.toThrow('Invalid segment column')
  })
})
