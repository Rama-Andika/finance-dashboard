import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Period } from '~/lib/finance/types'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))

// The GL snapshot (dash_snap_gl_monthly) is mocked: `built` decides which closed periods it "contains".
let built = new Set<string>()
const snapshotMovements = vi.fn()
vi.mock('~/server/dash/gl-snapshot', () => ({
  GL_SNAPSHOT_SEGMENT_COLUMN: 'segment1_id',
  builtGlPeriods: async () => built,
  snapshotMovements: (...args: unknown[]) => snapshotMovements(...args),
}))

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
    snapshotMovements.mockReset()
    snapshotMovements.mockResolvedValue([])
    built = new Set()
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

  it('reads closed periods that are in the GL snapshot from it, and only the others from the ERP tables', async () => {
    built = new Set(['p1', 'p2'])
    snapshotMovements.mockResolvedValue([
      { coaId: '10', periodId: 'p1', debet: '100.00', credit: '0.00' },
      { coaId: '10', periodId: 'p2', debet: '50.00', credit: '0.00' },
    ])
    rowsMock.mockResolvedValue([{ coaId: '10', periodId: 'p3', debet: '1', credit: '0' }])

    const result = await movementsByPeriods({
      periods: [period('p1'), period('p2'), period('p3')],
      segCol: 'segment1_id',
      segIds: 'all',
      coaIds: ['10'],
    })

    expect(snapshotMovements).toHaveBeenCalledTimes(1)
    expect(snapshotMovements.mock.calls[0]![0]).toEqual(['p1', 'p2'])
    expect(rowsMock).toHaveBeenCalledTimes(1) // only p3
    expect(result).toEqual([{ coaId: '10', periodId: undefined, locationId: undefined, debet: '151.00', credit: '0.00' }])
  })

  it('never uses the GL snapshot for another segment column or when switched off', async () => {
    built = new Set(['p1'])
    rowsMock.mockResolvedValue([])
    await movementsByPeriods({ periods: [period('p1')], segCol: 'segment2_id', segIds: 'all' })
    await movementsByPeriods({ periods: [period('p1')], segCol: 'segment1_id', segIds: 'all', useSnapshot: false })
    expect(snapshotMovements).not.toHaveBeenCalled()
    expect(rowsMock).toHaveBeenCalledTimes(2)
  })
})
