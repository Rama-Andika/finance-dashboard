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
    rowsMock.mockRejectedValue(Object.assign(new Error('no such table'), { errno: 1146, code: 'ER_NO_SUCH_TABLE' }))
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

  it('keeps money that already has two decimals as it is and rounds anything else like decimal.js', async () => {
    rowsMock.mockResolvedValue([
      {
        glId: 1,
        journalType: 1,
        periodId: 7,
        coaId: 5,
        segmentDetailId: null,
        debet: '12345678901234567890.12',
        credit: '-5.50',
      },
      { glId: 2, journalType: 1, periodId: 7, coaId: 5, segmentDetailId: null, debet: '0.00', credit: '3' },
      { glId: 3, journalType: 1, periodId: 7, coaId: 5, segmentDetailId: null, debet: null, credit: 4.5 },
      { glId: 4, journalType: 1, periodId: 7, coaId: 5, segmentDetailId: null, debet: '007.5', credit: '1.005' },
    ])
    const lines = await snapshotCashLines(['7'], 'all')
    expect(lines.map((l) => [l.debet, l.credit])).toEqual([
      ['12345678901234567890.12', '-5.50'],
      ['0.00', '3.00'],
      ['0.00', '4.50'],
      ['7.50', '1.01'], // text that is not in the two-decimal form goes through decimal.js
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

  it('reads the periods plainly, with no journal filter, when all entities are selected', async () => {
    rowsMock.mockResolvedValue([])
    await snapshotCashLines(['7', '8'], 'all')
    const { sql: text, params } = textOf(rowsMock.mock.calls[0]![0] as SQL)
    expect(text).toContain('WHERE s.period_id IN')
    expect(text).not.toContain('JOIN')
    expect(text).not.toContain('DISTINCT')
    expect(text).not.toContain('is_cash')
    expect(params).toEqual(['7', '8'])
  })

  it('keeps the journal filter (cash line in a selected segment) for an entity filter', async () => {
    rowsMock.mockResolvedValue([])
    await snapshotCashLines(['7'], ['100'])
    const { sql: text } = textOf(rowsMock.mock.calls[0]![0] as SQL)
    expect(text).toContain('JOIN')
    expect(text).toContain('DISTINCT')
    expect(text).toContain('is_cash = 1')
  })

  it('needs no cash account list: the cash flag does the work', async () => {
    rowsMock.mockResolvedValue([])
    await snapshotCashLines(['7'], ['100'])
    expect(textOf(rowsMock.mock.calls[0]![0] as SQL).sql).toContain('is_cash = 1')
  })
})
