import { describe, expect, it } from 'vitest'
import { describeWindow, isInsideDeployWindow, localMinutes, versionProblems } from './deploy-rules.mjs'

describe('localMinutes', () => {
  it('reads the wall clock of a time zone', () => {
    expect(localMinutes(new Date('2026-11-11T15:30:00Z'), 'Asia/Jakarta')).toBe(22 * 60 + 30) // UTC+7
    expect(localMinutes(new Date('2026-11-11T15:30:00Z'), 'Asia/Makassar')).toBe(23 * 60 + 30) // UTC+8
    expect(localMinutes(new Date('2026-11-11T17:05:00Z'), 'Asia/Jakarta')).toBe(5) // 00:05
  })
})

describe('isInsideDeployWindow', () => {
  it('counts the start of the window but not its end', () => {
    expect(isInsideDeployWindow(new Date('2026-11-11T14:59:00Z'), 'Asia/Jakarta')).toBe(false) // 21:59
    expect(isInsideDeployWindow(new Date('2026-11-11T15:00:00Z'), 'Asia/Jakarta')).toBe(true) // 22:00
    expect(isInsideDeployWindow(new Date('2026-11-11T21:59:00Z'), 'Asia/Jakarta')).toBe(true) // 04:59
    expect(isInsideDeployWindow(new Date('2026-11-11T22:00:00Z'), 'Asia/Jakarta')).toBe(false) // 05:00
  })

  it('is closed during working hours', () => {
    expect(isInsideDeployWindow(new Date('2026-11-11T05:00:00Z'), 'Asia/Jakarta')).toBe(false) // 12:00
    expect(isInsideDeployWindow(new Date('2026-11-11T03:00:00Z'), 'Asia/Jakarta')).toBe(false) // 10:00
  })

  it('uses the clock of the client, not of the computer', () => {
    const now = new Date('2026-11-11T14:00:00Z')
    expect(isInsideDeployWindow(now, 'Asia/Makassar')).toBe(true) // 22:00
    expect(isInsideDeployWindow(now, 'Asia/Jakarta')).toBe(false) // 21:00
  })

  it('handles a window that does not pass midnight', () => {
    const window = { start: '01:00', end: '03:00' }
    expect(isInsideDeployWindow(new Date('2026-11-11T18:30:00Z'), 'Asia/Jakarta', window)).toBe(true) // 01:30
    expect(isInsideDeployWindow(new Date('2026-11-11T21:00:00Z'), 'Asia/Jakarta', window)).toBe(false) // 04:00
  })
})

describe('describeWindow', () => {
  it('says the window and the zone', () => {
    expect(describeWindow('Asia/Jakarta')).toBe('22:00 to 05:00 (Asia/Jakarta)')
  })
})

describe('versionProblems', () => {
  const clean = { buildVersion: 'v1.2.0', exactTag: 'v1.2.0', treeDirty: false, allowDirty: false }

  it('accepts a clean tag for production and any clean commit for staging', () => {
    expect(versionProblems({ ...clean, env: 'production' })).toEqual([])
    expect(versionProblems({ ...clean, env: 'staging', buildVersion: 'v1.2.0-3-g1a2b3c4', exactTag: null })).toEqual([])
    expect(versionProblems({ ...clean, env: 'staging', buildVersion: '1a2b3c4', exactTag: null })).toEqual([])
  })

  it('refuses uncommitted changes, unless staging allows them', () => {
    const dirty = { ...clean, env: 'production', treeDirty: true, buildVersion: 'v1.2.0-dirty' }
    expect(versionProblems(dirty)).toContain(
      'there are uncommitted changes to tracked files; commit or stash them first',
    )
    expect(versionProblems({ ...dirty, allowDirty: true })).toContain(
      'there are uncommitted changes to tracked files; commit or stash them first',
    )
    const staging = { ...clean, env: 'staging', treeDirty: true, buildVersion: '1a2b3c4-dirty', exactTag: null }
    expect(versionProblems(staging)).toHaveLength(1)
    expect(versionProblems({ ...staging, allowDirty: true })).toEqual([])
  })

  it('refuses a build without a version', () => {
    expect(versionProblems({ ...clean, env: 'staging', buildVersion: 'unknown', exactTag: null })).toEqual([
      'the build has no version (is this a git folder?)',
    ])
  })

  it('wants a vMAJOR.MINOR.PATCH tag on this commit for production', () => {
    const message = 'production is released from a tag vMAJOR.MINOR.PATCH on the current commit (git tag v1.2.3)'
    expect(versionProblems({ ...clean, env: 'production', exactTag: null, buildVersion: '1a2b3c4' })).toEqual([message])
    expect(versionProblems({ ...clean, env: 'production', exactTag: 'release-1', buildVersion: 'release-1' })).toEqual([
      message,
    ])
  })

  it('wants the build to carry the tag', () => {
    expect(versionProblems({ ...clean, env: 'production', buildVersion: 'v1.1.0' })).toEqual([
      'the build version (v1.1.0) is not the tag of this commit (v1.2.0)',
    ])
  })
})
