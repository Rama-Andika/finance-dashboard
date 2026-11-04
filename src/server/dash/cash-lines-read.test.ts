import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { SQL } from 'drizzle-orm'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))

const { builtCashPeriods, snapshotCashLines } = await import('./cash-lines-read')
const { clearCache } = await import('~/server/cache')

const textOf = (query: SQL) => new MySqlDialect().sqlToQuery(query)

describe('builtCashPeriods', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    clearCache()
  })

  it('maps period ids to a build version and asks only for the given cash list', async () => {
    rowsMock.mockResolvedValue([{ id: '7', builtAt: '2026-10-01T00:00:00Z', rowCount: 5 }])
    const built = await builtCashPeriods('abc')
    expect(built.get('7')).toBe('2026-10-01T00:00:00Z#5')
    const { sql: text, params } = textOf(rowsMock.mock.calls[0]![0] as SQL)
    expect(text).toContain('cash_hash')
    expect(params).toContain('abc')
  })

  it('is empty when the snapshot tables do not exist', async () => {
    rowsMock.mockRejectedValue(new Error('no such table'))
    expect((await builtCashPeriods('abc')).size).toBe(0)
  })
})

describe('snapshotCashLines', () => {
  beforeEach(() => {
    rowsMock.mockReset()
  })

  it('reads nothing for no periods or an empty entity list', async () => {
    expect(await snapshotCashLines([], 'all')).toEqual([])
    expect(await snapshotCashLines(['1'], [])).toEqual([])
    expect(rowsMock).not.toHaveBeenCalled()
  })

  it('shapes rows like the live query: string ids, null segment, two-decimal money', async () => {
    rowsMock.mockResolvedValue([
      { glId: 11, journalType: '3', periodId: '7', coaId: 5, segmentDetailId: null, debet: '10', credit: '0.5' },
      { glId: 11, journalType: 3, periodId: 7, coaId: 6, segmentDetailId: '9', debet: '0.00', credit: '10.50' },
    ])
    const lines = await snapshotCashLines(['7'], 'all')
    expect(lines).toEqual([
      { glId: '11', journalType: 3, periodId: '7', coaId: '5', segmentDetailId: null, debet: '10.00', credit: '0.50' },
      { glId: '11', journalType: 3, periodId: '7', coaId: '6', segmentDetailId: '9', debet: '0.00', credit: '10.50' },
    ])
  })

  it('adds the segment filter only when entities are selected', async () => {
    rowsMock.mockResolvedValue([])
    await snapshotCashLines(['7'], 'all')
    await snapshotCashLines(['7'], ['100', '101'])
    const allText = textOf(rowsMock.mock.calls[0]![0] as SQL)
    const filtered = textOf(rowsMock.mock.calls[1]![0] as SQL)
    expect(allText.sql).not.toContain('k0.segment_id IN')
    expect(filtered.sql).toContain('k0.segment_id IN')
    expect(filtered.params).toEqual(expect.arrayContaining(['100', '101']))
  })

  it('needs no cash account list: the cash flag does the work', async () => {
    rowsMock.mockResolvedValue([])
    await snapshotCashLines(['7'], 'all')
    expect(textOf(rowsMock.mock.calls[0]![0] as SQL).sql).toContain('is_cash = 1')
  })
})
