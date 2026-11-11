import { beforeEach, describe, expect, it, vi } from 'vitest'

const warn = vi.fn()
vi.mock('./log', () => ({ dashLog: { warn: (...args: unknown[]) => warn(...args) } }))

const { isMissingTableError, readSnapshotIndex } = await import('./built-index')
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
    warn.mockReset()
    clearCache()
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

  it('is empty and logged for any other error, and asks again next time', async () => {
    const load = vi.fn(async (): Promise<Map<string, string>> => {
      throw new Error('connection lost')
    })
    const first = await readSnapshotIndex('test:index', 60_000, 'test index', load)
    const second = await readSnapshotIndex('test:index', 60_000, 'test index', load)
    expect(first.size).toBe(0)
    expect(second.size).toBe(0)
    expect(load).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ label: 'test index' }), expect.any(String))
  })
})
