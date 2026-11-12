import { describe, expect, it } from 'vitest'
import { versionProblems } from './package-rules.mjs'

describe('versionProblems', () => {
  const clean = { buildVersion: 'v1.2.0', treeDirty: false, allowDirty: false }

  it('accepts a clean commit, with or without a tag, for both environments', () => {
    for (const buildVersion of ['v1.2.0', 'v1.2.0-3-g1a2b3c4', '1a2b3c4']) {
      expect(versionProblems({ ...clean, env: 'production', buildVersion })).toEqual([])
      expect(versionProblems({ ...clean, env: 'staging', buildVersion })).toEqual([])
    }
  })

  it('refuses uncommitted changes, and allows them only for staging with --allow-dirty', () => {
    const message = 'there are uncommitted changes to tracked files; commit or stash them first'
    const dirty = { ...clean, treeDirty: true, buildVersion: '1a2b3c4-dirty' }
    expect(versionProblems({ ...dirty, env: 'staging' })).toEqual([message])
    expect(versionProblems({ ...dirty, env: 'staging', allowDirty: true })).toEqual([])
    expect(versionProblems({ ...dirty, env: 'production' })).toEqual([message])
    expect(versionProblems({ ...dirty, env: 'production', allowDirty: true })).toEqual([message])
  })

  it('notices a dirty build even when git reports a clean tree', () => {
    expect(versionProblems({ ...clean, env: 'production', buildVersion: 'v1.2.0-dirty' })).toHaveLength(1)
  })

  it('refuses a build without a version', () => {
    expect(versionProblems({ ...clean, env: 'staging', buildVersion: 'unknown' })).toEqual([
      'the build has no version (is this a git folder?)',
    ])
  })
})
