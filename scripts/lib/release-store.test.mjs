import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { activate, cleanup, linkedRelease, listReleases, readVersion, releasesDir, rollback } from './release-store.mjs'

const A = '20261101100000-v1.0.0'
const B = '20261105100000-v1.1.0'
const C = '20261110100000-v1.2.0'
const D = '20261111100000-v1.3.0'
const E = '20261112100000-v1.4.0'

let work = ''
let root = ''

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'release-store-'))
  root = join(work, 'deploy')
  mkdirSync(join(root, 'releases'), { recursive: true })
})

afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

/** The four files a release needs at least. */
const MINIMAL = {
  'package.json': '{}',
  'dist/base-path.json': '{"base":"/"}',
  'dist/build-info.json': '{"version":"v0"}',
  'scripts/start-server.mjs': '',
}

function writeFiles(dir, files) {
  for (const [file, text] of Object.entries(files)) {
    const full = join(dir, ...file.split('/'))
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, text)
  }
}

function makeRelease(name, version = 'v1.0.0') {
  writeFiles(join(releasesDir(root), name), { ...MINIMAL, 'dist/build-info.json': JSON.stringify({ version }) })
}

describe('listReleases', () => {
  it('lists release folders newest first and ignores everything else', () => {
    for (const name of [B, A, C]) makeRelease(name)
    mkdirSync(join(releasesDir(root), '.incoming'))
    mkdirSync(join(releasesDir(root), `.tmp-${D}`))
    mkdirSync(join(releasesDir(root), 'not-a-release'))
    writeFileSync(join(releasesDir(root), '20261111100000-file'), '')
    expect(listReleases(root)).toEqual([C, B, A])
  })

  it('is empty when there is no releases folder', () => {
    expect(listReleases(join(work, 'nowhere'))).toEqual([])
  })
})

describe('activate', () => {
  it('makes the first release current, and keeps the old one as previous', () => {
    makeRelease(A)
    makeRelease(B)
    expect(activate(root, A)).toEqual({ name: A, previous: null, changed: true })
    expect(linkedRelease(root, 'current')).toBe(A)
    expect(linkedRelease(root, 'previous')).toBeNull()

    expect(activate(root, B)).toEqual({ name: B, previous: A, changed: true })
    expect(linkedRelease(root, 'current')).toBe(B)
    expect(linkedRelease(root, 'previous')).toBe(A)
    expect(existsSync(join(releasesDir(root), A, 'package.json'))).toBe(true)
  })

  it('does nothing when the release is already current', () => {
    makeRelease(A)
    makeRelease(B)
    activate(root, A)
    activate(root, B)
    expect(activate(root, B)).toEqual({ name: B, previous: A, changed: false })
    expect(linkedRelease(root, 'previous')).toBe(A)
  })

  it('refuses a missing or incomplete release and changes nothing', () => {
    makeRelease(A)
    activate(root, A)
    expect(() => activate(root, B)).toThrow('does not exist')
    writeFiles(join(releasesDir(root), B), { 'package.json': '{}' })
    expect(() => activate(root, B)).toThrow('incomplete: missing dist/base-path.json')
    expect(() => activate(root, '../etc')).toThrow('not a release name')
    expect(linkedRelease(root, 'current')).toBe(A)
  })
})

describe('rollback', () => {
  it('goes back to the previous release and swaps the two', () => {
    makeRelease(A)
    makeRelease(B)
    activate(root, A)
    activate(root, B)
    expect(rollback(root)).toEqual({ name: A, from: B })
    expect(linkedRelease(root, 'current')).toBe(A)
    expect(linkedRelease(root, 'previous')).toBe(B)
    expect(rollback(root)).toEqual({ name: B, from: A })
    expect(linkedRelease(root, 'current')).toBe(B)
  })

  it('refuses when there is no previous release, or it is gone', () => {
    makeRelease(A)
    activate(root, A)
    expect(() => rollback(root)).toThrow('no previous release')
    makeRelease(B)
    activate(root, B)
    rmSync(join(releasesDir(root), A), { recursive: true })
    expect(() => rollback(root)).toThrow('gone or incomplete')
    expect(linkedRelease(root, 'current')).toBe(B)
  })
})

describe('readVersion', () => {
  it('reads the version of a release, or gives an empty text', () => {
    makeRelease(A, 'v1.0.0')
    expect(readVersion(root, A)).toBe('v1.0.0')
    expect(readVersion(root, B)).toBe('')
  })
})

describe('cleanup', () => {
  it('keeps the newest ones, the current and the previous release', () => {
    for (const name of [A, B, C, D, E]) makeRelease(name)
    activate(root, A)
    activate(root, B) // current B, previous A
    const result = cleanup(root, 2)
    expect(result.releases).toEqual([C])
    expect(listReleases(root)).toEqual([E, D, B, A])
  })

  it('removes leftovers of failed deploys', () => {
    makeRelease(A)
    makeRelease(B)
    mkdirSync(join(releasesDir(root), `.tmp-${C}`))
    writeFileSync(join(releasesDir(root), `.tmp-${C}`, 'x'), '')
    mkdirSync(join(releasesDir(root), '.incoming'))
    writeFileSync(join(releasesDir(root), '.incoming', `${C}.tgz`), 'x')
    const result = cleanup(root, 5)
    expect(result.releases).toEqual([])
    expect(result.leftovers.sort()).toEqual([join('.incoming', `${C}.tgz`), `.tmp-${C}`])
    expect(readdirSync(releasesDir(root)).sort()).toEqual(['.incoming', A, B].sort())
    expect(readdirSync(join(releasesDir(root), '.incoming'))).toEqual([])
  })

  it('removes nothing with dryRun, and refuses a keep below 2', () => {
    for (const name of [A, B, C]) makeRelease(name)
    expect(cleanup(root, 2, true).releases).toEqual([A])
    expect(listReleases(root)).toEqual([C, B, A])
    expect(() => cleanup(root, 1)).toThrow('at least 2')
    expect(() => cleanup(root, 2.5)).toThrow('at least 2')
  })
})
