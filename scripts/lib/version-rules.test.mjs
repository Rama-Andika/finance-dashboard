import { describe, expect, it } from 'vitest'
import { installVersionProblem, isRcTag, isStableTag } from './version-rules.mjs'

describe('isStableTag and isRcTag', () => {
  it('accept exactly vX.Y.Z and vX.Y.Z-rc.N (N from 1)', () => {
    expect(isStableTag('v1.2.0')).toBe(true)
    expect(isStableTag('v0.1.0')).toBe(true)
    expect(isRcTag('v1.2.0-rc.1')).toBe(true)
    expect(isRcTag('v1.2.0-rc.12')).toBe(true)
  })

  it('refuse everything else that git describe can print', () => {
    for (const text of [
      '1a2b3c4',
      'v1.2.0-3-g1a2b3c4',
      'v1.2.0-dirty',
      'v1.2.0-rc.1-dirty',
      'v1.2.0-rc.0',
      'v01.2.0',
      'v1.2',
      '1.2.0',
      'unknown',
      '',
    ]) {
      expect(isStableTag(text), text).toBe(false)
      expect(isRcTag(text), text).toBe(false)
    }
    expect(isStableTag('v1.2.0-rc.1')).toBe(false)
    expect(isRcTag('v1.2.0')).toBe(false)
  })
})

describe('installVersionProblem', () => {
  it('lets a stable tag go to production and to staging', () => {
    expect(installVersionProblem('v1.2.0', 'production')).toBe('')
    expect(installVersionProblem('v1.2.0', 'staging')).toBe('')
  })

  it('lets a release candidate go to staging only', () => {
    expect(installVersionProblem('v1.2.0-rc.1', 'staging')).toBe('')
    expect(installVersionProblem('v1.2.0-rc.1', 'production')).toContain('cannot go to production')
  })

  it('refuses a commit id, extra commits and a dirty build in both environments', () => {
    for (const text of ['1a2b3c4', 'v1.2.0-3-g1a2b3c4', 'v1.2.0-dirty', 'unknown']) {
      expect(installVersionProblem(text, 'staging')).toContain('cannot go to staging')
      expect(installVersionProblem(text, 'production')).toContain('cannot go to production')
    }
  })
})
