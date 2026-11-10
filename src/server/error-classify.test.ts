import { describe, expect, it } from 'vitest'
import { PUBLIC_ERROR_MESSAGES } from '~/lib/error-message'
import { classifyError, createPublicError, isPublicError, PUBLIC_ERROR_CODES } from './error-classify'

function withCode(code: string, errno?: number): Error {
  return Object.assign(new Error(code), errno === undefined ? { code } : { code, errno })
}

/** Drizzle wraps the mysql2 error as the cause of its failed-query error. */
function wrapped(cause: unknown): Error {
  return new Error('Failed query: SELECT 1', { cause })
}

describe('classifyError', () => {
  it('calls an unreachable database DB_UNAVAILABLE, also when it is the cause of another error', () => {
    for (const code of [
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'PROTOCOL_CONNECTION_LOST',
      'ER_CON_COUNT_ERROR',
      'ER_ACCESS_DENIED_ERROR',
    ]) {
      expect(classifyError(withCode(code))).toBe('DB_UNAVAILABLE')
      expect(classifyError(wrapped(withCode(code)))).toBe('DB_UNAVAILABLE')
    }
  })

  it('calls a query that ran too long TIMEOUT (MySQL 5.7: 3024, MariaDB: 1969)', () => {
    expect(classifyError(wrapped(withCode('ER_QUERY_TIMEOUT', 3024)))).toBe('TIMEOUT')
    expect(classifyError(wrapped(Object.assign(new Error('x'), { errno: 1969 })))).toBe('TIMEOUT')
    expect(classifyError(wrapped(Object.assign(new Error('x'), { errno: 1317 })))).toBe('TIMEOUT')
  })

  it('does not mistake the connect timeout ETIMEDOUT for a slow query', () => {
    expect(classifyError(withCode('ETIMEDOUT'))).toBe('DB_UNAVAILABLE')
  })

  it('calls everything else INTERNAL_ERROR', () => {
    expect(classifyError(new Error('anything'))).toBe('INTERNAL_ERROR')
    expect(classifyError(wrapped(withCode('ER_BAD_FIELD_ERROR', 1054)))).toBe('INTERNAL_ERROR')
    expect(classifyError('text')).toBe('INTERNAL_ERROR')
    expect(classifyError(null)).toBe('INTERNAL_ERROR')
  })

  it('stops after five levels of causes', () => {
    let error: Error = withCode('ECONNREFUSED')
    for (let i = 0; i < 6; i++) error = new Error('wrapper', { cause: error })
    expect(classifyError(error)).toBe('INTERNAL_ERROR')
  })
})

describe('createPublicError', () => {
  it('has the code and the request id in its message, and no stack and no other property', () => {
    const error = createPublicError('DB_UNAVAILABLE', '20261110-143551-k7q2m')
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe('DB_UNAVAILABLE#20261110-143551-k7q2m')
    expect(error.stack).toBeUndefined()
    expect(Object.getOwnPropertyNames(error)).toEqual(['message'])
  })

  it('is only the code when there is no request id', () => {
    const error = createPublicError('INTERNAL_ERROR', undefined)
    expect(error.message).toBe('INTERNAL_ERROR')
    expect(Object.getOwnPropertyNames(error)).toEqual(['message'])
  })
})

describe('isPublicError', () => {
  it('recognises the public codes only, with or without a request id', () => {
    expect(isPublicError(new Error('UNAUTHORIZED'))).toBe(true)
    expect(isPublicError(createPublicError('TIMEOUT', undefined))).toBe(true)
    expect(isPublicError(createPublicError('TIMEOUT', '20261110-143551-k7q2m'))).toBe(true)
    expect(isPublicError(new Error('Failed query'))).toBe(false)
    expect(isPublicError('TIMEOUT')).toBe(false)
  })
})

describe('PUBLIC_ERROR_CODES', () => {
  it('is the list the browser knows (src/lib/error-message.ts)', () => {
    expect(PUBLIC_ERROR_CODES).toBe(PUBLIC_ERROR_MESSAGES)
  })
})
