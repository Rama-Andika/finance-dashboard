import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Period } from '~/lib/core/types'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))
vi.mock('~/server/db/gl-columns', async () => {
  const { sql } = await import('drizzle-orm')
  return {
    glTableHasCanceledDate: async () => true,
    prefetchCanceledDateColumns: async () => {},
    notCanceledClause: async () => sql``,
  }
})

const builtMock = vi.fn()
const snapshotMock = vi.fn()
vi.mock('~/server/dash/cash-lines-read', () => ({
  builtCashPeriods: (...args: unknown[]) => builtMock(...args),
  snapshotCashLines: (...args: unknown[]) => snapshotMock(...args),
}))

const { linesOfCashJournals } = await import('./cashflow.repo')
const { clearCache } = await import('~/server/cache')

const period: Period = {
  periodeId: 'p1',
  name: 'p1',
  startDate: '2026-10-01',
  endDate: '2026-10-31',
  status: 'Open',
  type: 0,
  tableName: 'gl',
}

const line = (glId: string, coaId: string) => ({
  glId,
  journalType: 1,
  periodId: 'p1',
  coaId,
  segmentDetailId: 's1',
  debet: '10.00',
  credit: '0.00',
})

describe('linesOfCashJournals', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    builtMock.mockReset()
    snapshotMock.mockReset()
    builtMock.mockResolvedValue(new Map())
    snapshotMock.mockResolvedValue([])
    clearCache()
  })

  it('reads the same lines once for repeated and concurrent callers', async () => {
    rowsMock.mockResolvedValue([line('g1', '11')])
    const opts = { periods: [period], segCol: 'segment1_id', segIds: 'all' as const, cashCoaIds: ['11', '12'] }
    await Promise.all([linesOfCashJournals(opts), linesOfCashJournals({ ...opts, cashCoaIds: ['12', '11'] })])
    await linesOfCashJournals(opts)
    expect(rowsMock).toHaveBeenCalledTimes(1)
  })

  it('does not count a journal twice when it matches in two slices of the account list', async () => {
    // 1001 cash accounts → two slices; both slices return the same journal line
    rowsMock.mockResolvedValue([line('g1', '11')])
    const cashCoaIds = Array.from({ length: 1001 }, (_, i) => String(i + 1))
    const result = await linesOfCashJournals({ periods: [period], segCol: 'segment1_id', segIds: 'all', cashCoaIds })
    expect(rowsMock).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(1)
  })

  it('rejects a segment column that is not segmentN_id', () => {
    expect(() =>
      linesOfCashJournals({ periods: [period], segCol: 'x; DROP TABLE gl', segIds: 'all', cashCoaIds: ['11'] }),
    ).toThrow()
  })
})

describe('linesOfCashJournals over several GL tables', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    builtMock.mockReset()
    snapshotMock.mockReset()
    builtMock.mockResolvedValue(new Map())
    snapshotMock.mockResolvedValue([])
    clearCache()
  })

  it('starts every table at once and keeps the table order in the result', async () => {
    let releaseFirst: () => void = () => {}
    const first = new Promise<ReturnType<typeof line>[]>((resolve) => {
      releaseFirst = () => resolve([line('g1', '11')])
    })
    rowsMock.mockReturnValueOnce(first)
    rowsMock.mockResolvedValueOnce([line('g2', '12')])

    const archived: Period = { ...period, periodeId: 'p0', tableName: 'gl_2020' }
    const pending = linesOfCashJournals({
      periods: [period, archived],
      segCol: 'segment1_id',
      segIds: 'all',
      cashCoaIds: ['11', '12'],
    })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(rowsMock).toHaveBeenCalledTimes(2)

    releaseFirst()
    const result = await pending
    expect(result.map((l) => l.glId)).toEqual(['g1', 'g2'])
  })
})

describe('linesOfCashJournals with the cash-lines snapshot', () => {
  const closed: Period = { ...period, periodeId: 'c1', status: 'Closed' }
  const opts = { segCol: 'segment1_id', segIds: 'all' as const, cashCoaIds: ['11', '12'] }

  beforeEach(() => {
    rowsMock.mockReset()
    builtMock.mockReset()
    snapshotMock.mockReset()
    clearCache()
    builtMock.mockResolvedValue(new Map([['c1', 'v1']]))
    snapshotMock.mockResolvedValue([{ ...line('s1', '11'), periodId: 'c1' }])
    rowsMock.mockResolvedValue([line('g1', '12')])
  })

  it('reads a closed period in the snapshot from it and the other periods from the ERP', async () => {
    const result = await linesOfCashJournals({ ...opts, periods: [closed, period] })
    expect(snapshotMock).toHaveBeenCalledWith(['c1'], 'all')
    expect(rowsMock).toHaveBeenCalledTimes(1)
    expect(result.map((l) => l.glId).sort()).toEqual(['g1', 's1'])
  })

  it('asks for snapshot periods built for exactly this cash account list', async () => {
    await linesOfCashJournals({ ...opts, periods: [closed] })
    const { hashIds } = await import('~/server/cache')
    expect(builtMock).toHaveBeenCalledWith(hashIds(['11', '12']))
  })

  it('does not read the ERP at all when every period is in the snapshot', async () => {
    await linesOfCashJournals({ ...opts, periods: [closed] })
    expect(rowsMock).not.toHaveBeenCalled()
  })

  it('never uses the snapshot for an Open period, another segment column or when told not to', async () => {
    builtMock.mockResolvedValue(new Map([['p1', 'v1']])) // p1 is the Open period
    await linesOfCashJournals({ ...opts, periods: [period] })
    expect(snapshotMock).toHaveBeenCalledWith([], 'all') // nothing selected for the snapshot

    clearCache()
    snapshotMock.mockClear()
    builtMock.mockResolvedValue(new Map([['c1', 'v1']]))
    await linesOfCashJournals({ ...opts, segCol: 'segment2_id', periods: [closed] })
    await linesOfCashJournals({ ...opts, useSnapshot: false, periods: [closed] })
    for (const call of snapshotMock.mock.calls) expect(call[0]).toEqual([])
  })

  it('falls back to the ERP for a closed period whose cash account list does not match the snapshot', async () => {
    builtMock.mockResolvedValue(new Map()) // nothing built for this list
    await linesOfCashJournals({ ...opts, periods: [closed] })
    expect(rowsMock).toHaveBeenCalledTimes(1)
  })

  it('counts a journal once when the snapshot and the ERP both return it', async () => {
    snapshotMock.mockResolvedValue([{ ...line('g1', '12'), periodId: 'c1' }])
    const result = await linesOfCashJournals({ ...opts, periods: [closed, period] })
    expect(result).toHaveLength(1)
  })
})
