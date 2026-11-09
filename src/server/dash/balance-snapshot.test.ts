import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PROFIT_GROUP_KEY } from '~/lib/finance/balance-sheet/trend'
import { periodKey, statsKey } from '~/lib/finance/period/period-fingerprint'
import type { Period } from '~/lib/core/types'

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  listPeriods: vi.fn(),
  glPeriodStats: vi.fn(),
  glPeriodStatsSharedMany: vi.fn(),
}))

vi.mock('~/server/db/refresh-pool', () => ({ refreshPool: { getConnection: mocks.getConnection } }))
vi.mock('~/server/repo/master-data/periods.repo', () => ({ listPeriods: mocks.listPeriods }))
vi.mock('~/server/repo/gl/gl-period-stats.repo', () => ({
  glPeriodStats: mocks.glPeriodStats,
  glPeriodStatsSharedMany: mocks.glPeriodStatsSharedMany,
}))
vi.mock('./log', () => ({ dashLog: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }))

const { refreshBalanceSnapshot, balanceInsertStatement } = await import('./balance-snapshot')
const { DASH_TABLES } = await import('./tables')

const STATS = { journals: '10', maxGlId: '500', posted: '10', canceled: '0' }

const period: Period = {
  periodeId: '7',
  name: 'Period 7',
  startDate: '2026-07-01',
  endDate: '2026-07-31',
  status: 'Closed',
  type: 0,
  tableName: 'gl',
}

type FakeConn = {
  query: ReturnType<typeof vi.fn>
  release: ReturnType<typeof vi.fn>
  beginTransaction: ReturnType<typeof vi.fn>
  commit: ReturnType<typeof vi.fn>
  rollback: ReturnType<typeof vi.fn>
}

/** A connection that answers by the kind of statement. */
function fakeConnection(options: { glBuilt?: boolean; openingRows?: number; failInsert?: boolean }): FakeConn {
  const conn: FakeConn = {
    release: vi.fn(),
    beginTransaction: vi.fn(),
    commit: vi.fn(),
    rollback: vi.fn(async () => {}),
    query: vi.fn(async (text: string) => {
      if (text.includes('GET_LOCK')) return [[{ got: 1 }]]
      if (text.startsWith('SELECT CAST(period_id')) return [[]]
      if (text.startsWith('SELECT 1 AS built')) return [options.glBuilt === false ? [] : [{ built: 1 }]]
      if (text.startsWith('SELECT COUNT(*)')) return [[{ n: options.openingRows ?? 5 }]]
      if (text.startsWith('INSERT INTO ?? (period_id, segment_id')) {
        if (options.failInsert) throw new Error('insert failed')
        return [{ affectedRows: 7 }]
      }
      return [[]]
    }),
  }
  mocks.getConnection.mockResolvedValue(conn)
  return conn
}

const starting = (conn: FakeConn, text: string) =>
  conn.query.mock.calls.filter((call) => String(call[0]).startsWith(text))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.listPeriods.mockResolvedValue([period])
  mocks.glPeriodStats.mockResolvedValue(STATS)
})

describe('balanceInsertStatement', () => {
  it('has one parameter for every placeholder (?? for a table name, ? for a value)', () => {
    const { sql, params } = balanceInsertStatement('7')
    expect((sql.match(/\?\??/g) ?? []).length).toBe(params.length)
  })

  it('writes to the balance table and reads the GL snapshot twice, with the right groups', () => {
    const { sql, params } = balanceInsertStatement('7')
    expect(params[0]).toBe(DASH_TABLES.balanceMonthly)
    expect(params.filter((p) => p === DASH_TABLES.glMonthly)).toHaveLength(2)
    expect(params).toContain('7')
    expect(params[3]).toEqual([
      'Liquid Assets',
      'Fixed Assets',
      'Other Assets',
      'Current Liabilities',
      'Long Term Liabilities',
      'Equity',
    ])
    expect(params[4]).toEqual(['Liquid Assets', 'Fixed Assets', 'Other Assets'])
    expect(params[10]).toEqual(['Revenue', 'Cost Of Sales', 'Expense', 'Other Revenue', 'Other Expense'])
    expect(sql).toContain(`'${PROFIT_GROUP_KEY}'`)
  })

  it('uses nothing MySQL 5.7 does not have', () => {
    const { sql } = balanceInsertStatement('7')
    expect(sql).not.toMatch(/\bWITH\b|\bOVER\s*\(|\bLATERAL\b|\bROW_NUMBER\b/i)
  })
})

describe('refreshBalanceSnapshot', () => {
  it('builds a Closed period: its rows and its marker in one transaction', async () => {
    const conn = fakeConnection({})
    const result = await refreshBalanceSnapshot()

    expect(result).toMatchObject({ ran: true, built: 1, rebuilt: 0, removed: 0 })
    expect(conn.beginTransaction).toHaveBeenCalledTimes(1)
    expect(starting(conn, 'DELETE FROM')[0]?.[1]).toEqual([DASH_TABLES.balanceMonthly, '7'])
    expect(starting(conn, 'INSERT INTO ?? (period_id, segment_id')).toHaveLength(1)
    const marker = starting(conn, 'INSERT INTO ?? (period_id, built_at')[0]!
    expect(marker[1]).toEqual([
      DASH_TABLES.balancePeriods,
      '7',
      7,
      expect.any(Number),
      periodKey(period),
      statsKey(STATS),
    ])
    expect(conn.commit).toHaveBeenCalledTimes(1)
    expect(conn.rollback).not.toHaveBeenCalled()
  })

  it('leaves a period alone while its GL snapshot is not there yet', async () => {
    const conn = fakeConnection({ glBuilt: false })
    await refreshBalanceSnapshot()

    expect(conn.beginTransaction).not.toHaveBeenCalled()
    expect(starting(conn, 'DELETE FROM')).toHaveLength(0)
    expect(starting(conn, 'INSERT INTO')).toHaveLength(0)
    expect(mocks.glPeriodStats).not.toHaveBeenCalled()
  })

  it('marks a period without saved opening balances as built with no rows, so it is not tried again', async () => {
    const conn = fakeConnection({ openingRows: 0 })
    await refreshBalanceSnapshot()

    expect(starting(conn, 'INSERT INTO ?? (period_id, segment_id')).toHaveLength(0)
    const marker = starting(conn, 'INSERT INTO ?? (period_id, built_at')[0]!
    expect((marker[1] as unknown[])[2]).toBe(0)
    expect(conn.commit).toHaveBeenCalledTimes(1)
  })

  it('rolls back and fails when the rows cannot be written', async () => {
    const conn = fakeConnection({ failInsert: true })
    await expect(refreshBalanceSnapshot()).rejects.toThrow('insert failed')

    expect(conn.rollback).toHaveBeenCalledTimes(1)
    expect(conn.commit).not.toHaveBeenCalled()
    expect(starting(conn, 'INSERT INTO ?? (period_id, built_at')).toHaveLength(0)
    expect(conn.release).toHaveBeenCalledTimes(1)
  })
})
