import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const warn = vi.fn()
vi.mock('./log', () => ({ dashLog: { warn: (...args: unknown[]) => warn(...args) } }))

const { clearSnapshotIndexPauses, isMissingTableError, readSnapshotIndex } = await import('./built-index')
const { clearCache } = await import('~/server/cache')

const missingTable = () =>
  Object.assign(new Error("Table 'x' doesn't exist"), { errno: 1146, code: 'ER_NO_SUCH_TABLE' })

describe('isMissingTableError', () => {
  it('knows the error code, the error number and a cause that has one of them', () => {
    expect(isMissingTableError(missingTable())).toBe(true)
    expect(isMissingTableError(Object.assign(new Error('x'), { errno: 1146 }))).toBe(true)
    expect(isMissingTableError(Object.assign(new Error('Failed query'), { cause: missingTable() }))).toBe(true)
  })

  it('does not take any other error for a missing table', () => {
    expect(isMissingTableError(new Error('no such table'))).toBe(false)
    expect(isMissingTableError(Object.assign(new Error('x'), { code: 'ECONNREFUSED' }))).toBe(false)
    expect(isMissingTableError('text')).toBe(false)
    expect(isMissingTableError(null)).toBe(false)
  })
})

describe('readSnapshotIndex', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-11T10:00:00Z'))
    warn.mockReset()
    clearCache()
    clearSnapshotIndexPauses()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('returns what the loader reads and keeps it for the given time', async () => {
    const load = vi.fn(async () => new Map([['7', 'v1']]))
    const first = await readSnapshotIndex('test:index', 60_000, 'test index', load)
    const second = await readSnapshotIndex('test:index', 60_000, 'test index', load)
    expect(Array.from(first)).toEqual([['7', 'v1']])
    expect(second).toBe(first)
    expect(load).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('is empty and silent when the table does not exist, and remembers that', async () => {
    const load = vi.fn(async (): Promise<Map<string, string>> => {
      throw missingTable()
    })
    const first = await readSnapshotIndex('test:index', 60_000, 'test index', load)
    const second = await readSnapshotIndex('test:index', 60_000, 'test index', load)
    expect(first.size).toBe(0)
    expect(second.size).toBe(0)
    expect(load).toHaveBeenCalledTimes(1)
    expect(warn).not.toHaveBeenCalled()
  })

  it('is empty and logged once for any other error, and does not read again during the pause', async () => {
    const load = vi.fn(async (): Promise<Map<string, string>> => {
      throw new Error('connection lost')
    })
    const first = await readSnapshotIndex('test:index', 60_000, 'test index', load)
    vi.advanceTimersByTime(9_000)
    const second = await readSnapshotIndex('test:index', 60_000, 'test index', load)
    expect(first.size).toBe(0)
    expect(second.size).toBe(0)
    expect(load).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ label: 'test index' }), expect.any(String))
  })

  it('reads again when the pause is over, and keeps a good answer as usual', async () => {
    let failing = true
    const load = vi.fn(async () => {
      if (failing) throw new Error('connection lost')
      return new Map([['7', 'v1']])
    })
    expect((await readSnapshotIndex('test:index', 60_000, 'test index', load)).size).toBe(0)

    failing = false
    vi.advanceTimersByTime(10_001)
    const recovered = await readSnapshotIndex('test:index', 60_000, 'test index', load)
    const again = await readSnapshotIndex('test:index', 60_000, 'test index', load)

    expect(Array.from(recovered)).toEqual([['7', 'v1']])
    expect(again).toBe(recovered)
    expect(load).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('logs a read that fails again after the pause', async () => {
    const load = vi.fn(async (): Promise<Map<string, string>> => {
      throw new Error('connection lost')
    })
    await readSnapshotIndex('test:index', 60_000, 'test index', load)
    vi.advanceTimersByTime(10_001)
    await readSnapshotIndex('test:index', 60_000, 'test index', load)
    expect(load).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(2)
  })

  it('logs once when several callers wait for the same failed read', async () => {
    const load = vi.fn(async (): Promise<Map<string, string>> => {
      throw new Error('connection lost')
    })
    const results = await Promise.all([
      readSnapshotIndex('test:index', 60_000, 'test index', load),
      readSnapshotIndex('test:index', 60_000, 'test index', load),
      readSnapshotIndex('test:index', 60_000, 'test index', load),
    ])
    expect(results.map((r) => r.size)).toEqual([0, 0, 0])
    expect(load).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledTimes(1)
  })

  it('pauses each reader on its own', async () => {
    const failing = vi.fn(async (): Promise<Map<string, string>> => {
      throw new Error('connection lost')
    })
    const healthy = vi.fn(async () => new Map([['7', 'v1']]))
    await readSnapshotIndex('test:a', 60_000, 'reader a', failing)
    const other = await readSnapshotIndex('test:b', 60_000, 'reader b', healthy)
    expect(Array.from(other)).toEqual([['7', 'v1']])
    expect(healthy).toHaveBeenCalledTimes(1)
  })
})
