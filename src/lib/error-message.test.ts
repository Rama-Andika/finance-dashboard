import { describe, expect, it } from 'vitest'
import { errorMessageKey } from './error-message'

describe('errorMessageKey', () => {
  it('maps the unauthorized code to the session-expired text', () => {
    expect(errorMessageKey(new Error('UNAUTHORIZED'), 'metric.errorBody')).toBe('metric.sessionExpired')
  })

  it('never exposes a raw message such as failed SQL', () => {
    const error = new Error('Failed query: SELECT * FROM ap_ar_card params: 1')
    expect(errorMessageKey(error, 'metric.errorBody')).toBe('metric.errorBody')
  })

  it('falls back for non-Error values', () => {
    expect(errorMessageKey('boom', 'metric.errorBody')).toBe('metric.errorBody')
  })
})
