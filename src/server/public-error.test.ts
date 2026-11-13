import { afterEach, describe, expect, it } from 'vitest'
import { notFound, redirect } from '@tanstack/react-router'
import { runWithLogContext } from '~/server/logging/log-context'
import { captureLogs, resetLoggerForTests } from '~/server/logging/logger-core'
import { toPublicError } from './public-error'

afterEach(() => resetLoggerForTests())

/** Same shape as Drizzle's failed-query error: the message repeats the parameter values. */
function failedQuery(cause?: unknown): Error {
  return Object.assign(new Error('Failed query: SELECT * FROM ap_ar_card WHERE d = ?\nparams: 2026-10-01'), {
    query: 'SELECT * FROM ap_ar_card WHERE d = ?',
    params: ['2026-10-01'],
    cause,
  })
}

describe('toPublicError', () => {
  it('replaces a failed-query error with a code and the request id in the message, no stack, and logs the original under the same id', () => {
    const capture = captureLogs()
    const result = runWithLogContext({ reqId: '20261110-143551-k7q2m', userId: '17' }, () =>
      toPublicError(failedQuery(), 'getApAgingFn'),
    ) as Error
    const [entry] = capture.entries()
    const written = capture.lines().join('')
    capture.stop()

    expect(result).toBeInstanceOf(Error)
    expect(result.message).toBe('INTERNAL_ERROR#20261110-143551-k7q2m')
    expect(result.stack).toBeUndefined()
    expect(entry).toMatchObject({
      level: 'error',
      msg: 'server function failed',
      fn: 'getApAgingFn',
      publicCode: 'INTERNAL_ERROR',
      reqId: '20261110-143551-k7q2m',
      userId: '17',
      err: { message: 'Failed query', sql: 'SELECT * FROM ap_ar_card WHERE d = ?' },
    })
    expect(written).not.toContain('2026-10-01')
  })

  it('tells an unreachable database from a slow query', () => {
    const capture = captureLogs()
    const unreachable = toPublicError(
      failedQuery(Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })),
    )
    const slow = toPublicError(failedQuery(Object.assign(new Error('x'), { code: 'ER_QUERY_TIMEOUT', errno: 3024 })))
    capture.stop()
    expect((unreachable as Error).message).toBe('DB_UNAVAILABLE')
    expect((slow as Error).message).toBe('TIMEOUT')
  })

  it('has no request id outside a request, and still no stack', () => {
    const capture = captureLogs()
    const result = toPublicError(new Error('boom')) as Error
    capture.stop()
    expect(result.message).toBe('INTERNAL_ERROR')
    expect(result.stack).toBeUndefined()
  })

  it('keeps the unauthorized code, adds the request id and drops the stack', () => {
    const capture = captureLogs()
    const result = runWithLogContext({ reqId: '20261110-143551-k7q2m' }, () =>
      toPublicError(new Error('UNAUTHORIZED')),
    ) as Error
    const entries = capture.entries()
    capture.stop()
    expect(result.message).toBe('UNAUTHORIZED#20261110-143551-k7q2m')
    expect(result.stack).toBeUndefined()
    expect(entries).toHaveLength(0)
  })

  it('returns an error that already carries a request id as it is', () => {
    const capture = captureLogs()
    const first = runWithLogContext({ reqId: 'a' }, () => toPublicError(new Error('boom')))
    const second = runWithLogContext({ reqId: 'b' }, () => toPublicError(first))
    capture.stop()
    expect(second).toBe(first)
    expect((second as Error).message).toBe('INTERNAL_ERROR#a')
  })

  it('passes redirects, not-found results and responses through', () => {
    const r = redirect({ href: '/login' })
    const n = notFound()
    const response = new Response('x')
    expect(toPublicError(r)).toBe(r)
    expect(toPublicError(n)).toBe(n)
    expect(toPublicError(response)).toBe(response)
  })

  it('keeps a plain FEATURE_DISABLED error as a public one, adds the request id, and logs nothing', () => {
    const capture = captureLogs()
    const result = runWithLogContext({ reqId: '20261110-143551-k7q2m' }, () =>
      toPublicError(new Error('FEATURE_DISABLED'), 'someFn'),
    ) as Error
    const entries = capture.entries()
    capture.stop()
    expect(result.message).toBe('FEATURE_DISABLED#20261110-143551-k7q2m')
    expect(result.stack).toBeUndefined()
    expect(entries).toEqual([])
  })
})
