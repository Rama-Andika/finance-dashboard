import { describe, expect, it } from 'vitest'
import { basePath, cookieName, cookiePath, stripBasePath, withBasePath } from './base-path'

describe('base path of a build for the root (unit tests run without a client id)', () => {
  it('is empty, so nothing is prefixed', () => {
    expect(basePath).toBe('')
    expect(withBasePath('/summary')).toBe('/summary')
    expect(stripBasePath('/summary')).toBe('/summary')
  })

  it('uses "/" as the cookie path', () => {
    expect(cookiePath).toBe('/')
  })

  it('keeps the plain cookie names', () => {
    expect(cookieName('nr_session')).toBe('nr_session')
  })
})
