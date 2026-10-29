import { describe, expect, it, vi } from 'vitest'
import { notFound, redirect } from '@tanstack/react-router'
import { toPublicError } from './public-error'

describe('toPublicError', () => {
  it('replaces a failed-query error with a generic code and logs the original', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const raw = new Error('Failed query: SELECT i.ap_ar_card_id FROM ap_ar_card i params: 2026-10-01')
    const result = toPublicError(raw)
    expect(result).toBeInstanceOf(Error)
    expect((result as Error).message).toBe('INTERNAL_ERROR')
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
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
