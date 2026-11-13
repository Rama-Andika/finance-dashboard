import { describe, expect, it } from 'vitest'
import { DIRTY_MESSAGE, versionProblems } from './package-rules.mjs'

describe('versionProblems', () => {
  const clean = { buildVersion: 'v1.2.0', treeDirty: false, localOnly: false }

  it('accepts a stable tag for production and for staging', () => {
    expect(versionProblems({ ...clean, env: 'production' })).toEqual([])
    expect(versionProblems({ ...clean, env: 'staging' })).toEqual([])
  })

  it('accepts a release candidate tag for staging only', () => {
    expect(versionProblems({ ...clean, env: 'staging', buildVersion: 'v1.2.0-rc.1' })).toEqual([])
    const problems = versionProblems({ ...clean, env: 'production', buildVersion: 'v1.2.0-rc.1' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('cannot go to production')
  })

  it('refuses a commit id and a build with extra commits, for both environments', () => {
    for (const buildVersion of ['1a2b3c4', 'v1.2.0-3-g1a2b3c4']) {
      expect(versionProblems({ ...clean, env: 'production', buildVersion })[0]).toContain('cannot go to production')
      expect(versionProblems({ ...clean, env: 'staging', buildVersion })[0]).toContain('cannot go to staging')
    }
  })

  it('refuses uncommitted changes with one message, also when only the version says it', () => {
    const dirty = { ...clean, treeDirty: true, buildVersion: 'v1.2.0-dirty' }
    expect(versionProblems({ ...dirty, env: 'staging' })).toEqual([DIRTY_MESSAGE])
    expect(versionProblems({ ...dirty, env: 'production' })).toEqual([DIRTY_MESSAGE])
    expect(versionProblems({ ...clean, env: 'production', buildVersion: 'v1.2.0-dirty' })).toEqual([DIRTY_MESSAGE])
  })

  it('refuses a build without a version, also with localOnly', () => {
    const message = 'the build has no version (is this a git folder?)'
    expect(versionProblems({ ...clean, env: 'staging', buildVersion: 'unknown' })).toEqual([message])
    expect(versionProblems({ ...clean, env: 'staging', buildVersion: 'unknown', localOnly: true })).toEqual([message])
  })

  it('lets localOnly package any commit, dirty or not, for either environment', () => {
    for (const env of ['staging', 'production']) {
      expect(versionProblems({ env, buildVersion: '1a2b3c4-dirty', treeDirty: true, localOnly: true })).toEqual([])
      expect(versionProblems({ env, buildVersion: 'v1.2.0-3-g1a2b3c4', treeDirty: false, localOnly: true })).toEqual([])
    }
  })
})
