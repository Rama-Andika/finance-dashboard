import { describe, expect, it } from 'vitest'
import {
  addPrefix,
  baseUrlForClient,
  CLIENT_ID_PATTERN,
  cookieNameFor,
  prefixFromBaseUrl,
  removePrefix,
} from './client-base'

describe('baseUrlForClient', () => {
  it('builds the prefix with a slash on both sides', () => {
    expect(baseUrlForClient('client-a')).toBe('/oxy-client-a-finance-dashboard/')
    expect(baseUrlForClient('a2')).toBe('/oxy-a2-finance-dashboard/')
  })

  it('serves at the root when there is no client id', () => {
    expect(baseUrlForClient(undefined)).toBe('/')
    expect(baseUrlForClient('')).toBe('/')
    expect(baseUrlForClient('  ')).toBe('/')
  })

  it('rejects ids that would break the URL', () => {
    for (const bad of ['A', 'a b', 'a/b', '../x', '-a', 'a.b', 'a'.repeat(65)]) {
      expect(() => baseUrlForClient(bad)).toThrow(/CLIENT_ID/)
    }
  })

  it('accepts the longest allowed id', () => {
    expect(baseUrlForClient('a'.repeat(64))).toBe(`/oxy-${'a'.repeat(64)}-finance-dashboard/`)
  })

  it('uses the same pattern that the env check uses', () => {
    expect(CLIENT_ID_PATTERN.test('client-a')).toBe(true)
    expect(CLIENT_ID_PATTERN.test('Client-A')).toBe(false)
  })
})

describe('prefixFromBaseUrl', () => {
  it('drops the trailing slash', () => {
    expect(prefixFromBaseUrl('/oxy-client-a-finance-dashboard/')).toBe('/oxy-client-a-finance-dashboard')
  })

  it('gives an empty prefix for the root', () => {
    expect(prefixFromBaseUrl('/')).toBe('')
    expect(prefixFromBaseUrl('')).toBe('')
  })
})

describe('addPrefix', () => {
  it('puts the prefix in front of an in-app path', () => {
    expect(addPrefix('/p', '/summary')).toBe('/p/summary')
    expect(addPrefix('/p', '/summary?entity=all')).toBe('/p/summary?entity=all')
    expect(addPrefix('/p', '/')).toBe('/p/')
  })

  it('adds the missing leading slash', () => {
    expect(addPrefix('/p', 'summary')).toBe('/p/summary')
    expect(addPrefix('', 'summary')).toBe('/summary')
  })

  it('changes nothing for an empty prefix', () => {
    expect(addPrefix('', '/summary')).toBe('/summary')
  })
})

describe('cookieNameFor', () => {
  it('keeps the plain name at the root', () => {
    expect(cookieNameFor('', 'nr_session')).toBe('nr_session')
  })

  it('adds the prefix without its slash under a prefix', () => {
    expect(cookieNameFor('/oxy-client-a-finance-dashboard', 'nr_session')).toBe(
      'nr_session_oxy-client-a-finance-dashboard',
    )
  })

  it('gives two deployments different names, and neither equals the root name', () => {
    const a = cookieNameFor('/oxy-a-finance-dashboard', 'nr_theme')
    const b = cookieNameFor('/oxy-b-finance-dashboard', 'nr_theme')
    expect(new Set([a, b, 'nr_theme']).size).toBe(3)
  })

  it('only uses characters that are allowed in a cookie name', () => {
    expect(cookieNameFor(`/oxy-${'a'.repeat(64)}-finance-dashboard`, 'nr_session')).toMatch(/^[A-Za-z0-9_-]+$/)
  })
})

describe('removePrefix', () => {
  it('removes the prefix from a path inside it', () => {
    expect(removePrefix('/p', '/p/summary')).toBe('/summary')
    expect(removePrefix('/p', '/p/_serverFn/abc')).toBe('/_serverFn/abc')
  })

  it('turns the prefix itself into the root path', () => {
    expect(removePrefix('/p', '/p')).toBe('/')
    expect(removePrefix('/p', '/p/')).toBe('/')
  })

  it('leaves a path outside the prefix alone, including a longer sibling prefix', () => {
    expect(removePrefix('/p', '/other')).toBe('/other')
    expect(removePrefix('/p', '/px/summary')).toBe('/px/summary')
  })

  it('changes nothing for an empty prefix', () => {
    expect(removePrefix('', '/summary')).toBe('/summary')
  })
})
