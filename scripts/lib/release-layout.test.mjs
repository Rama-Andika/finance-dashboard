import { describe, expect, it } from 'vitest'
import {
  healthUrl,
  isSafeRemotePath,
  parseDeployFolder,
  RELEASE_NAME_PATTERN,
  RELEASE_TAG_PATTERN,
  releaseName,
  safeVersion,
} from './release-layout.mjs'

describe('safeVersion', () => {
  it('keeps what git describe writes', () => {
    expect(safeVersion('v1.2.0')).toBe('v1.2.0')
    expect(safeVersion('v1.2.0-3-g1a2b3c4-dirty')).toBe('v1.2.0-3-g1a2b3c4-dirty')
    expect(safeVersion('1a2b3c4')).toBe('1a2b3c4')
  })

  it('replaces what does not belong in a folder name', () => {
    expect(safeVersion('release/2026 beta')).toBe('release-2026-beta')
    expect(safeVersion('a;rm -rf /')).toBe('a-rm--rf-')
  })

  it('starts with a letter or digit, is at most 80 characters, and is never empty', () => {
    expect(safeVersion('---x')).toBe('x')
    expect(safeVersion('v' + '1'.repeat(200))).toHaveLength(80)
    expect(safeVersion('')).toBe('unknown')
    expect(safeVersion('...')).toBe('unknown')
  })
})

describe('releaseName', () => {
  it('puts the UTC time first so that sorting the names sorts the time', () => {
    const first = releaseName('v1.2.0', new Date('2026-11-11T22:30:15.123Z'))
    const second = releaseName('v1.10.0', new Date('2026-11-12T01:00:00.000Z'))
    expect(first).toBe('20261111223015-v1.2.0')
    expect(first).toMatch(RELEASE_NAME_PATTERN)
    expect([second, first].sort()).toEqual([first, second])
  })

  it('cleans the version', () => {
    expect(releaseName('feature/login', new Date('2026-01-02T03:04:05Z'))).toBe('20260102030405-feature-login')
  })
})

describe('RELEASE_TAG_PATTERN', () => {
  it('accepts vMAJOR.MINOR.PATCH only', () => {
    expect(RELEASE_TAG_PATTERN.test('v1.4.2')).toBe(true)
    expect(RELEASE_TAG_PATTERN.test('v10.0.12')).toBe(true)
    for (const bad of ['1.4.2', 'v1.4', 'v1.4.2-rc1', 'v1.4.2-3-g1a2b3c4', 'v1.4.2-dirty', 'release-1']) {
      expect(RELEASE_TAG_PATTERN.test(bad)).toBe(false)
    }
  })
})

describe('parseDeployFolder', () => {
  it('reads a staging folder', () => {
    expect(parseDeployFolder('oxy-acme-staging-finance-dashboard-5205')).toEqual({
      client: 'acme',
      env: 'staging',
      port: 5205,
      clientId: 'acme-staging',
      unit: 'oxy-finance-dashboard@acme-staging-finance-dashboard-5205',
    })
  })

  it('reads a production folder', () => {
    expect(parseDeployFolder('oxy-acme-corp-production-finance-dashboard-5105')).toEqual({
      client: 'acme-corp',
      env: 'production',
      port: 5105,
      clientId: 'acme-corp',
      unit: 'oxy-finance-dashboard@acme-corp-production-finance-dashboard-5105',
    })
  })

  it('refuses another name', () => {
    expect(parseDeployFolder('acme')).toBeNull()
    expect(parseDeployFolder('oxy-acme-dev-finance-dashboard-5205')).toBeNull()
    expect(parseDeployFolder('oxy-acme-staging-finance-dashboard-')).toBeNull()
  })
})

describe('isSafeRemotePath', () => {
  it('accepts a plain absolute path', () => {
    expect(isSafeRemotePath('/home/oxy/web-server/oxy-acme-staging-finance-dashboard-5205')).toBe(true)
  })

  it('refuses everything that could change a command line', () => {
    for (const bad of [
      'relative/path',
      '/a b',
      '/a;b',
      '/a&b',
      '/a$(x)',
      "/a'b",
      '/a"b',
      '/a/../b',
      '/a/',
      '/',
      '',
      '/a\nb',
    ]) {
      expect(isSafeRemotePath(bad)).toBe(false)
    }
  })
})

describe('healthUrl', () => {
  it('uses the local address and the prefix of the client', () => {
    expect(healthUrl(5205, 'acme-staging')).toBe('http://127.0.0.1:5205/oxy-acme-staging-finance-dashboard/health')
    expect(healthUrl('5105', 'acme')).toBe('http://127.0.0.1:5105/oxy-acme-finance-dashboard/health')
  })

  it('has no prefix for a build for the root', () => {
    expect(healthUrl(3000, '')).toBe('http://127.0.0.1:3000/health')
  })
})
