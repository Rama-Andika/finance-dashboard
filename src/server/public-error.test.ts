import { afterEach, describe, expect, it } from 'vitest'
import { notFound, redirect } from '@tanstack/react-router'
import { captureLogs, resetLoggerForTests } from './logging/logger-core'
import { toPublicError } from './public-error'

afterEach(() => resetLoggerForTests())

describe('toPublicError', () => {
  it('replaces a failed-query error with a generic code and logs the original', () => {
    const capture = captureLogs()
    const raw = new Error('Failed query: SELECT i.ap_ar_card_id FROM ap_ar_card i params: 2026-10-01')
    const result = toPublicError(raw)
    const entries = capture.entries()
    capture.stop()
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('INTERNAL_ERROR')
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ level: 'error', msg: 'server function failed:' })
  })

  it('keeps the unauthorized code', () => {
    const error = new Error('UNAUTHORIZED')
    expect(toPublicError(error)).toBe(error)
  })

  it('passes redirects and not-found through', () => {
    const r = redirect({ href: '/login' })
    const n = notFound()
    expect(toPublicError(r)).toBe(r)
    expect(toPublicError(n)).toBe(n)
  })
})
