import { describe, expect, it } from 'vitest'
import {
  errorMessageKey,
  errorReference,
  isPublicErrorMessage,
  parsePublicError,
  publicErrorMessage,
} from './error-message'

describe('publicErrorMessage', () => {
  it('is the code, then the request id after a hash when there is one', () => {
    expect(publicErrorMessage('DB_UNAVAILABLE', '20261110-143551-k7q2m')).toBe('DB_UNAVAILABLE#20261110-143551-k7q2m')
    expect(publicErrorMessage('TIMEOUT')).toBe('TIMEOUT')
    expect(publicErrorMessage('TIMEOUT', '')).toBe('TIMEOUT')
  })
})

describe('parsePublicError', () => {
  it('reads the code and the request id out of the message', () => {
    expect(parsePublicError(new Error('DB_UNAVAILABLE#20261110-143551-k7q2m'))).toEqual({
      code: 'DB_UNAVAILABLE',
      reference: '20261110-143551-k7q2m',
    })
    expect(parsePublicError(new Error('UNAUTHORIZED'))).toEqual({ code: 'UNAUTHORIZED', reference: null })
  })

  it('answers null for any other message, also one that only starts like a code', () => {
    expect(parsePublicError(new Error('Failed to fetch'))).toBeNull()
    expect(parsePublicError(new Error('TIMEOUT_EXTRA'))).toBeNull()
    expect(parsePublicError(new Error('constructor'))).toBeNull()
    expect(parsePublicError(new Error('#20261110-143551-k7q2m'))).toBeNull()
    expect(parsePublicError('TIMEOUT')).toBeNull()
    expect(parsePublicError(null)).toBeNull()
  })

  it('treats an id that is not plain text as no id', () => {
    expect(parsePublicError(new Error('INTERNAL_ERROR#has spaces'))?.reference).toBeNull()
    expect(parsePublicError(new Error('INTERNAL_ERROR#'))?.reference).toBeNull()
    expect(parsePublicError(new Error(`INTERNAL_ERROR#${'a'.repeat(65)}`))?.reference).toBeNull()
  })
})

describe('errorMessageKey', () => {
  it('maps the public codes to their texts, with or without a request id', () => {
    expect(errorMessageKey(new Error('UNAUTHORIZED'), 'metric.errorBody')).toBe('metric.sessionExpired')
    expect(errorMessageKey(new Error('DB_UNAVAILABLE#20261110-143551-k7q2m'), 'metric.errorBody')).toBe(
      'metric.errorDbUnavailable',
    )
    expect(errorMessageKey(new Error('TIMEOUT#20261110-143551-k7q2m'), 'metric.errorBody')).toBe('metric.errorTimeout')
  })

  it('never exposes a raw message such as failed SQL', () => {
    const error = new Error('Failed query: SELECT * FROM ap_ar_card params: 1')
    expect(errorMessageKey(error, 'metric.errorBody')).toBe('metric.errorBody')
  })

  it('uses the fallback for INTERNAL_ERROR and for a message that names a property of Object', () => {
    expect(errorMessageKey(new Error('INTERNAL_ERROR#20261110-143551-k7q2m'), 'metric.errorBody')).toBe(
      'metric.errorBody',
    )
    expect(errorMessageKey(new Error('constructor'), 'metric.errorBody')).toBe('metric.errorBody')
    expect(errorMessageKey(new Error('__proto__'), 'metric.errorBody')).toBe('metric.errorBody')
  })

  it('falls back for non-Error values', () => {
    expect(errorMessageKey('boom', 'metric.errorBody')).toBe('metric.errorBody')
  })
})

describe('errorReference', () => {
  it('reads the request id of an error from a server function', () => {
    expect(errorReference(new Error('INTERNAL_ERROR#20261110-143551-k7q2m'))).toBe('20261110-143551-k7q2m')
  })

  it('answers null when there is no id, or the error is not a public error', () => {
    expect(errorReference(new Error('INTERNAL_ERROR'))).toBeNull()
    expect(errorReference(new Error('boom'))).toBeNull()
    expect(errorReference(new Error('boom#20261110-143551-k7q2m'))).toBeNull()
    expect(errorReference('text')).toBeNull()
    expect(errorReference(null)).toBeNull()
  })
})

describe('isPublicErrorMessage', () => {
  it('recognises the four public codes, with or without an id, and nothing else', () => {
    for (const code of ['UNAUTHORIZED', 'DB_UNAVAILABLE', 'TIMEOUT', 'INTERNAL_ERROR']) {
      expect(isPublicErrorMessage(new Error(code))).toBe(true)
      expect(isPublicErrorMessage(new Error(`${code}#20261110-143551-k7q2m`))).toBe(true)
    }
    expect(isPublicErrorMessage(new Error('Failed to fetch'))).toBe(false)
    expect(isPublicErrorMessage('TIMEOUT')).toBe(false)
  })
})
