import { beforeEach, describe, expect, it, vi } from 'vitest'
import { periodKey, statsKey } from '~/lib/finance/period/period-fingerprint'
import type { Period } from '~/lib/core/types'

const mocks = vi.hoisted(() => ({
  getConnection: vi.fn(),
  listPeriods: vi.fn(),
  glPeriodStatsShared: vi.fn(),
  info: vi.fn(),
}))

vi.mock('~/server/db/refresh-pool', () => ({ refreshPool: { getConnection: mocks.getConnection } }))
vi.mock('~/server/repo/master-data/periods.repo', () => ({ listPeriods: mocks.listPeriods }))
vi.mock('~/server/repo/gl/gl-period-stats.repo', () => ({ glPeriodStatsShared: mocks.glPeriodStatsShared }))
vi.mock('./log', () => ({ dashLog: { info: mocks.info, warn: vi.fn(), error: vi.fn() } }))

const { refreshClosedPeriods } = await import('./closed-period-refresh')
const { DASH_TABLES } = await import('./tables')

const SPEC = {
  label: 'test snapshot',
  lockName: 'dash_refresh_test',
  rowsTable: DASH_TABLES.glMonthly,
  markerTable: DASH_TABLES.glPeriods,
}

const period = (id: string, start: string, status: Period['status'] = 'Closed'): Period => ({
  periodeId: id,
  name: `Period ${id}`,
  startDate: start,
  endDate: start.replace(/-01$/, '-28'),
  status,
  type: 0,
  tableName: 'gl',
})

const STATS = { journals: '10', maxGlId: '500', posted: '10', canceled: '0' }
const iso = (msAgo: number) => new Date(Date.now() - msAgo).toISOString().replace(/\.\d{3}Z$/, 'Z')

/** A marker row as the snapshot would hold it for `p`: fingerprint matches, built and checked recently. */
const marker = (p: Period, over: Record<string, unknown> = {}) => ({
  id: p.periodeId,
  periodKey: periodKey(p),
  statsKey: statsKey(STATS),
  extra: null,
  builtAt: iso(60 * 60_000),
  checkedAt: iso(60_000),
  ...over,
})

type FakeConn = { query: ReturnType<typeof vi.fn>; release: ReturnType<typeof vi.fn> }

/** A connection that answers by the kind of statement; `markers` are the rows of the "built" table. */
function fakeConnection(options: { lock?: boolean; markers?: unknown[] }): FakeConn {
  const conn: FakeConn = {
    release: vi.fn(),
    query: vi.fn(async (text: string) => {
      if (text.includes('GET_LOCK')) return [[{ got: options.lock === false ? 0 : 1 }]]
      if (text.startsWith('SELECT CAST(period_id')) return [options.markers ?? []]
      return [[]]
    }),
  }
  mocks.getConnection.mockResolvedValue(conn)
  return conn
}

const statements = (conn: FakeConn, start: string) =>
  conn.query.mock.calls.filter((call) => String(call[0]).startsWith(start))

beforeEach(() => {
  vi.resetAllMocks()
  mocks.glPeriodStatsShared.mockResolvedValue(STATS)
})

describe('refreshClosedPeriods', () => {
  it('does nothing and keeps the lock alone when another run holds it', async () => {
    const conn = fakeConnection({ lock: false })
    const build = vi.fn()

    expect(await refreshClosedPeriods(SPEC, build)).toEqual({ ran: false, reason: 'locked' })

    expect(build).not.toHaveBeenCalled()
    expect(mocks.listPeriods).not.toHaveBeenCalled()
    expect(statements(conn, 'SELECT RELEASE_LOCK')).toHaveLength(0)
    expect(conn.release).toHaveBeenCalledTimes(1)
  })

  it('builds the Closed periods that are not in the snapshot, newest first, and skips the others', async () => {
    const jan = period('1', '2026-01-01')
    const feb = period('2', '2026-02-01')
    const mar = period('3', '2026-03-01')
    const open = period('4', '2026-04-01', 'Open')
    mocks.listPeriods.mockResolvedValue([jan, mar, open, feb])
    const conn = fakeConnection({ markers: [] })
    const built: string[] = []

    const result = await refreshClosedPeriods(SPEC, async (_conn, p) => {
      built.push(p.periodeId)
    })

    expect(built).toEqual(['3', '2', '1'])
    expect(result).toMatchObject({ ran: true, built: 3, rebuilt: 0, removed: 0 })
    expect(mocks.glPeriodStatsShared).not.toHaveBeenCalled()
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('test snapshot 1/3: Period 3'))
    expect(statements(conn, 'SELECT RELEASE_LOCK')).toHaveLength(1)
    expect(conn.release).toHaveBeenCalledTimes(1)
  })

  it('drops a built period that is no longer Closed, from the rows and from the markers', async () => {
    const jan = period('1', '2026-01-01')
    const reopened = period('2', '2026-02-01', 'Open')
    mocks.listPeriods.mockResolvedValue([jan, reopened])
    const conn = fakeConnection({ markers: [marker(jan), marker(reopened)] })
    const build = vi.fn()

    const result = await refreshClosedPeriods(SPEC, build)

    expect(build).not.toHaveBeenCalled()
    expect(result).toMatchObject({ ran: true, built: 0, removed: 1 })
    const deletes = statements(conn, 'DELETE FROM')
    expect(deletes.map((call) => call[1])).toEqual([
      [DASH_TABLES.glMonthly, ['2']],
      [DASH_TABLES.glPeriods, ['2']],
    ])
  })

  it('keeps a period whose journal counts are unchanged and only moves its checked time', async () => {
    const jan = period('1', '2026-01-01')
    mocks.listPeriods.mockResolvedValue([jan])
    const conn = fakeConnection({ markers: [marker(jan)] })
    const build = vi.fn()

    const result = await refreshClosedPeriods(SPEC, build)

    expect(result).toEqual({ ran: false, reason: 'nothing-to-do' })
    expect(build).not.toHaveBeenCalled()
    expect(mocks.glPeriodStatsShared).toHaveBeenCalledTimes(1)
    const updates = statements(conn, 'UPDATE')
    expect(updates).toHaveLength(1)
    expect(updates[0]?.[1]).toEqual([DASH_TABLES.glPeriods, ['1']])
  })

  it('rebuilds a period whose journal counts changed and counts it as rebuilt', async () => {
    const jan = period('1', '2026-01-01')
    mocks.listPeriods.mockResolvedValue([jan])
    fakeConnection({ markers: [marker(jan, { statsKey: statsKey({ ...STATS, journals: '9' }) })] })
    const build = vi.fn()

    const result = await refreshClosedPeriods(SPEC, build)

    expect(build).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ ran: true, built: 1, rebuilt: 1, removed: 0 })
    expect(mocks.info).toHaveBeenCalledWith(expect.stringContaining('(rebuilt)'))
  })

  it('rebuilds a period whose extra marker column no longer matches, without asking the ERP for counts', async () => {
    const jan = period('1', '2026-01-01')
    mocks.listPeriods.mockResolvedValue([jan])
    const conn = fakeConnection({ markers: [marker(jan, { extra: 'old-hash' })] })
    const build = vi.fn()

    const result = await refreshClosedPeriods({ ...SPEC, extra: { column: 'cash_hash', expected: 'new-hash' } }, build)

    expect(build).toHaveBeenCalledTimes(1)
    expect(result).toMatchObject({ ran: true, built: 1, rebuilt: 1 })
    expect(mocks.glPeriodStatsShared).not.toHaveBeenCalled()
    // the extra column is selected by name through an identifier placeholder
    const select = statements(conn, 'SELECT CAST(period_id')[0]!
    expect(String(select[0])).toContain('?? AS extra')
    expect(select[1]).toEqual(['cash_hash', DASH_TABLES.glPeriods])
  })

  it('keeps a period whose extra marker column still matches', async () => {
    const jan = period('1', '2026-01-01')
    mocks.listPeriods.mockResolvedValue([jan])
    fakeConnection({ markers: [marker(jan, { extra: 'same-hash' })] })
    const build = vi.fn()

    const result = await refreshClosedPeriods({ ...SPEC, extra: { column: 'cash_hash', expected: 'same-hash' } }, build)

    expect(build).not.toHaveBeenCalled()
    expect(result).toEqual({ ran: false, reason: 'nothing-to-do' })
  })

  it('releases the lock and the connection when building a period fails', async () => {
    const jan = period('1', '2026-01-01')
    mocks.listPeriods.mockResolvedValue([jan])
    const conn = fakeConnection({ markers: [] })

    await expect(
      refreshClosedPeriods(SPEC, async () => {
        throw new Error('build failed')
      }),
    ).rejects.toThrow('build failed')

    expect(statements(conn, 'SELECT RELEASE_LOCK')).toHaveLength(1)
    expect(conn.release).toHaveBeenCalledTimes(1)
  })
})
