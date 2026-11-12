import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { missingPayloadFiles, PAYLOAD_REQUIRED_FILES, packageRelease } from './package-release.mjs'

let work = ''
let root = ''
let out = ''

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'package-release-'))
  root = join(work, 'project')
  out = join(work, 'out')
  mkdirSync(root)
  mkdirSync(out)
})

afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

function writeProject(files) {
  for (const [file, text] of Object.entries(files)) {
    const full = join(root, ...file.split('/'))
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, text)
  }
}

/** A project folder that has every required file, plus things that must not travel. */
function fullProject() {
  writeProject(Object.fromEntries(PAYLOAD_REQUIRED_FILES.map((file) => [file, `// ${file}`])))
  writeProject({
    'dist/client/assets/app.js': 'client',
    'scripts/lib/env-file.test.mjs': 'a test',
    'scripts/ops/release-cli.test.mjs': 'a test',
    'scripts/deploy/package.mjs': 'laptop only',
    'scripts/build-client.mjs': 'laptop only',
    'src/server/x.ts': 'source',
    'node_modules/react/index.js': 'package',
    '.env': 'SECRET=1',
  })
}

/** The files in an archive, without the leading "./". */
function listArchive(archive) {
  const listed = spawnSync(
    'tar',
    [
      '-tzf',
      archive
        .slice(work.length + 1)
        .split('\\')
        .join('/'),
    ],
    { cwd: work, encoding: 'utf8' },
  )
  expect(listed.status, listed.stderr).toBe(0)
  return listed.stdout
    .split(/\r?\n/)
    .map((line) => line.replace(/^\.\//, ''))
    .filter((line) => line !== '' && !line.endsWith('/'))
}

describe('missingPayloadFiles', () => {
  it('lists what is missing and nothing when the project is complete', () => {
    expect(missingPayloadFiles(root)).toEqual(PAYLOAD_REQUIRED_FILES)
    fullProject()
    expect(missingPayloadFiles(root)).toEqual([])
  })
})

describe('packageRelease', () => {
  it('refuses to package an unbuilt project', () => {
    writeProject({ 'package.json': '{}' })
    expect(() => packageRelease({ root, workDir: out, name: '20261111100000-v1' })).toThrow(
      'cannot package: missing dist/base-path.json',
    )
  })

  it('packs the release and leaves out tests, sources, packages and secrets', () => {
    fullProject()
    const { archive, sizeBytes } = packageRelease({ root, workDir: out, name: '20261111100000-v1.0.0' })
    expect(sizeBytes).toBeGreaterThan(0)
    const files = listArchive(archive)
    for (const required of PAYLOAD_REQUIRED_FILES) expect(files).toContain(required)
    expect(files).toContain('dist/client/assets/app.js')
    for (const left of [
      'scripts/lib/env-file.test.mjs',
      'scripts/ops/release-cli.test.mjs',
      'scripts/deploy/package.mjs',
      'scripts/build-client.mjs',
      'src/server/x.ts',
      'node_modules/react/index.js',
      '.env',
    ]) {
      expect(files).not.toContain(left)
    }
  })

  it('makes an archive that opens into a folder with the same files', () => {
    fullProject()
    const { archive } = packageRelease({ root, workDir: out, name: '20261111100000-v1.0.0' })
    mkdirSync(join(out, 'opened'))
    const opened = spawnSync('tar', ['-xzf', '20261111100000-v1.0.0.tgz', '-C', 'opened'], {
      cwd: out,
      encoding: 'utf8',
    })
    expect(opened.status, opened.stderr).toBe(0)
    expect(archive.endsWith('20261111100000-v1.0.0.tgz')).toBe(true)
    expect(readFileSync(join(out, 'opened', 'dist', 'base-path.json'), 'utf8')).toBe('// dist/base-path.json')
    expect(readFileSync(join(out, 'opened', 'scripts', 'start-server.mjs'), 'utf8')).toBe('// scripts/start-server.mjs')
  })
})
