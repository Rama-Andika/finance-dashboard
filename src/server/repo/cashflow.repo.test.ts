import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Period } from '~/lib/core/types'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))
vi.mock('~/server/db/gl-columns', async () => {
  const { sql } = await import('drizzle-orm')
  return { glTableHasCanceledDate: async () => true, prefetchCanceledDateColumns: async () => {}, notCanceledClause: async () => sql`` }
})

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
    clearCache()
  })

  it('starts every table at once and keeps the table order in the result', async () => {
    let releaseFirst: () => void = () => {}
    const first = new Promise<ReturnType<typeof line>[]>((resolve) => { releaseFirst = () => resolve([line('g1', '11')]) })
    rowsMock.mockReturnValueOnce(first)
    rowsMock.mockResolvedValueOnce([line('g2', '12')])

    const archived: Period = { ...period, periodeId: 'p0', tableName: 'gl_2020' }
    const pending = linesOfCashJournals({ periods: [period, archived], segCol: 'segment1_id', segIds: 'all', cashCoaIds: ['11', '12'] })
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(rowsMock).toHaveBeenCalledTimes(2)

    releaseFirst()
    const result = await pending
    expect(result.map((l) => l.glId)).toEqual(['g1', 'g2'])
  })
})
