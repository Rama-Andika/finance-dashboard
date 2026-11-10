import { afterEach, describe, expect, it, vi } from 'vitest'
import { captureLogs, resetLoggerForTests } from '~/server/logging/logger-core'
import { logIfSlow, logPoolWait, sqlSummary, timed } from './perf'

afterEach(() => {
  vi.restoreAllMocks()
  resetLoggerForTests()
})

describe('timed', () => {
  it('returns the result and logs the label and the duration at debug level', async () => {
    const capture = captureLogs()
    expect(await timed('metric x', async () => 'ok')).toBe('ok')
    const [entry] = capture.entries()
    capture.stop()
    expect(entry).toMatchObject({ level: 'debug', scope: 'perf', msg: 'timed', label: 'metric x' })
    expect(typeof entry?.durationMs).toBe('number')
  })

  it('writes nothing at the default info level', async () => {
    const capture = captureLogs('info')
    await timed('metric x', async () => 42)
    expect(capture.entries()).toEqual([])
    capture.stop()
  })

  it('logs and rethrows when the work fails', async () => {
    const capture = captureLogs()
    await expect(timed('metric y', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    const [entry] = capture.entries()
    capture.stop()
    expect(entry).toMatchObject({ label: 'metric y' })
  })
})

describe('sqlSummary', () => {
  it('collapses whitespace and cuts long text', () => {
    expect(sqlSummary('SELECT a\n   FROM  t\n WHERE x = ?')).toBe('SELECT a FROM t WHERE x = ?')
    expect(sqlSummary('x'.repeat(50), 10)).toBe(`${'x'.repeat(10)}…`)
  })
})

describe('logIfSlow', () => {
  it('logs only a query at or above the threshold, and never builds the text otherwise', () => {
    const capture = captureLogs()
    const text = vi.fn(() => 'SELECT 1')
    logIfSlow(999, 1000, text)
    expect(text).not.toHaveBeenCalled()
    logIfSlow(1500, 1000, text)
    const entries = capture.entries()
    capture.stop()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({
      level: 'warn',
      scope: 'perf',
      msg: 'slow query',
      durationMs: 1500,
      sql: 'SELECT 1',
    })
  })

  it('is off for a threshold of 0 or a missing threshold', () => {
    const capture = captureLogs()
    logIfSlow(99_999, 0, () => 'SELECT 1')
    logIfSlow(99_999, undefined as unknown as number, () => 'SELECT 1')
    const entries = capture.entries()
    capture.stop()
    expect(entries).toEqual([])
  })
})

describe('logPoolWait', () => {
  it('logs at debug level', () => {
    const capture = captureLogs()
    logPoolWait()
    const [entry] = capture.entries()
    capture.stop()
    expect(entry).toMatchObject({ level: 'debug', scope: 'perf' })
  })
})
