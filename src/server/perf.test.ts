import { afterEach, describe, expect, it, vi } from 'vitest'
import { logIfSlow, sqlSummary, timed } from './perf'

describe('timed', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns the result and logs nothing when PERF_LOG is off', async () => {
    const info = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await timed('metric x', async () => 42)).toBe(42)
    expect(info).not.toHaveBeenCalled()
  })

  it('logs the label and the duration when PERF_LOG=1', async () => {
    vi.stubEnv('PERF_LOG', '1')
    const info = vi.spyOn(console, 'log').mockImplementation(() => {})
    expect(await timed('metric x', async () => 'ok')).toBe('ok')
    expect(info).toHaveBeenCalledWith(expect.stringMatching(/^perf: metric x \d+ms$/))
  })

  it('logs and rethrows when the work fails', async () => {
    vi.stubEnv('PERF_LOG', '1')
    const info = vi.spyOn(console, 'log').mockImplementation(() => {})
    await expect(timed('metric y', () => Promise.reject(new Error('boom')))).rejects.toThrow('boom')
    expect(info).toHaveBeenCalledWith(expect.stringContaining('metric y'))
  })
})

describe('sqlSummary', () => {
  it('collapses whitespace and cuts long text', () => {
    expect(sqlSummary('SELECT a\n   FROM  t\n WHERE x = ?')).toBe('SELECT a FROM t WHERE x = ?')
    expect(sqlSummary('x'.repeat(50), 10)).toBe(`${'x'.repeat(10)}…`)
  })
})

describe('logIfSlow', () => {
  afterEach(() => vi.restoreAllMocks())

  it('logs only a query at or above the threshold, and never builds the text otherwise', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const text = vi.fn(() => 'SELECT 1')
    logIfSlow(999, 1000, text)
    expect(text).not.toHaveBeenCalled()
    logIfSlow(1500, 1000, text)
    expect(warn).toHaveBeenCalledWith('perf: slow query 1500ms: SELECT 1')
  })

  it('is off for a threshold of 0 or a missing threshold', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    logIfSlow(99_999, 0, () => 'SELECT 1')
    logIfSlow(99_999, undefined as unknown as number, () => 'SELECT 1')
    expect(warn).not.toHaveBeenCalled()
  })
})
