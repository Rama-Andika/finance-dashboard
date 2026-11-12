import { describe, expect, it } from 'vitest'
import { baseUrlForClient, prefixFromBaseUrl } from '../../src/lib/core/client-base.ts'
import { buildMismatchMessage, expectedPrefix } from './build-prefix.mjs'

describe('expectedPrefix', () => {
  it('gives the same prefix as baseUrlForClient in src/lib/core/client-base.ts', () => {
    for (const id of ['client-a', 'acme-staging', 'a1', '', undefined]) {
      expect(expectedPrefix(id)).toBe(prefixFromBaseUrl(baseUrlForClient(id)))
    }
  })

  it('has no prefix for an empty or blank CLIENT_ID', () => {
    expect(expectedPrefix('')).toBe('')
    expect(expectedPrefix('  ')).toBe('')
    expect(expectedPrefix(undefined)).toBe('')
  })
})

describe('buildMismatchMessage', () => {
  it('accepts a client id that matches the build, and the root build without a client id', () => {
    expect(buildMismatchMessage({ clientId: 'client-a', builtPrefix: '/oxy-client-a-finance-dashboard' })).toBeNull()
    expect(buildMismatchMessage({ clientId: undefined, builtPrefix: '' })).toBeNull()
  })

  it('names both prefixes when they differ', () => {
    const message = buildMismatchMessage({ clientId: 'client-b', builtPrefix: '/oxy-client-a-finance-dashboard' })
    expect(message).toContain('/oxy-client-a-finance-dashboard')
    expect(message).toContain('/oxy-client-b-finance-dashboard')
    expect(message).toContain('CLIENT_ID')
  })

  it('refuses a client id for a root build and a missing client id for a client build', () => {
    expect(buildMismatchMessage({ clientId: 'client-a', builtPrefix: '' })).toContain('"/"')
    expect(buildMismatchMessage({ clientId: '', builtPrefix: '/oxy-client-a-finance-dashboard' })).toContain(
      'CLIENT_ID',
    )
  })
})
