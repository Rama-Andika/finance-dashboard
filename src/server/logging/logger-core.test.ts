import { afterEach, describe, expect, it, vi } from 'vitest'
import { runWithLogContext } from './log-context'
import { captureLogs, createLogger, resetLoggerForTests, resolveLogLevel } from './logger-core'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  resetLoggerForTests()
})

describe('resolveLogLevel', () => {
  it('uses a known level, otherwise info', () => {
    expect(resolveLogLevel('debug', false)).toBe('debug')
    expect(resolveLogLevel('WARN', false)).toBe('info')
    expect(resolveLogLevel(undefined, false)).toBe('info')
    expect(resolveLogLevel('nonsense', false)).toBe('info')
  })

  it('is silent under a test unless LOG_LEVEL names a level', () => {
    expect(resolveLogLevel(undefined, true)).toBe('silent')
    expect(resolveLogLevel('nonsense', true)).toBe('silent')
    expect(resolveLogLevel('debug', true)).toBe('debug')
  })
})

describe('createLogger', () => {
  it('writes one JSON object with level, time, scope, fields and message', () => {
    const capture = captureLogs()
    createLogger('dash').info({ label: 'built', durationMs: 12 }, 'snapshot built')
    const [entry] = capture.entries()
    capture.stop()
    expect(entry).toMatchObject({ level: 'info', scope: 'dash', msg: 'snapshot built', label: 'built', durationMs: 12 })
    expect(String(entry?.time)).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}[+-]\d{2}:\d{2}$/)
  })

  it('writes the time in APP_TIMEZONE', () => {
    vi.stubEnv('APP_TIMEZONE', 'Asia/Makassar')
    const capture = captureLogs()
    createLogger().info({}, 'x')
    const [entry] = capture.entries()
    capture.stop()
    expect(String(entry?.time).endsWith('+08:00')).toBe(true)
  })

  it('has no scope without one', () => {
    const capture = captureLogs()
    createLogger().info({}, 'x')
    const [entry] = capture.entries()
    capture.stop()
    expect(entry).not.toHaveProperty('scope')
  })

  it('adds the client from CLIENT_ID', () => {
    vi.stubEnv('CLIENT_ID', 'client-a')
    const capture = captureLogs()
    createLogger('x').info({}, 'hello')
    const [entry] = capture.entries()
    capture.stop()
    expect(entry?.client).toBe('client-a')
  })

  it('writes an error object through the serializer, without the parameter values', () => {
    const capture = captureLogs()
    const error = Object.assign(new Error('Failed query: SELECT 1\nparams: secret-value'), {
      query: 'SELECT 1',
      params: ['secret-value'],
    })
    createLogger('db').error({ err: error }, 'query failed')
    const [entry] = capture.entries()
    const written = capture.lines().join('')
    capture.stop()
    expect(entry?.err).toMatchObject({ message: 'Failed query', sql: 'SELECT 1' })
    expect(written).not.toContain('secret-value')
  })

  it('still accepts the older form: message first, cause second', () => {
    const capture = captureLogs()
    createLogger('cache').warn('background reload failed', new Error('db down'))
    createLogger('cache').info('plain')
    const [first, second] = capture.entries()
    capture.stop()
    expect(first).toMatchObject({ level: 'warn', msg: 'background reload failed', err: { message: 'db down' } })
    expect(second).toMatchObject({ level: 'info', msg: 'plain' })
    expect(second).not.toHaveProperty('err')
  })

  it('adds the request context to every line written inside it', async () => {
    const capture = captureLogs()
    const log = createLogger('x')
    await runWithLogContext({ reqId: '20261110-143551-k7q2m', userId: '17', upstreamId: 'proxy-1' }, async () => {
      await Promise.resolve()
      log.info({}, 'inside')
    })
    log.info({}, 'outside')
    const [inside, outside] = capture.entries()
    capture.stop()
    expect(inside).toMatchObject({ reqId: '20261110-143551-k7q2m', userId: '17', upstreamId: 'proxy-1' })
    expect(outside).not.toHaveProperty('reqId')
  })

  it('adds the job context', () => {
    const capture = captureLogs()
    runWithLogContext({ jobId: 'job-20261110-144500-p2d1x', parentReqId: '20261110-144459-t8w3y' }, () => {
      createLogger('dash').info({}, 'step')
    })
    const [entry] = capture.entries()
    capture.stop()
    expect(entry).toMatchObject({ jobId: 'job-20261110-144500-p2d1x', parentReqId: '20261110-144459-t8w3y' })
  })

  it('writes nothing under Vitest unless the logs are captured', () => {
    const write = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
    createLogger('x').error({}, 'nobody hears this')
    expect(write).not.toHaveBeenCalled()
  })

  it('respects the level: debug lines are dropped at info', () => {
    const capture = captureLogs('info')
    createLogger('x').debug({}, 'hidden')
    createLogger('x').info({}, 'shown')
    const entries = capture.entries()
    capture.stop()
    expect(entries.map((e) => e.msg)).toEqual(['shown'])
  })
})
