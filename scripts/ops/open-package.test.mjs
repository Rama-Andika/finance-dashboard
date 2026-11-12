import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DEPLOY_FOLDER_PATTERN } from '../lib/env-rules.mjs'
import { RELEASE_NAME_PATTERN, REQUIRED_RELEASE_FILES } from '../lib/release-layout.mjs'
import {
  DEPLOY_FOLDER_PATTERN as COPY_FOLDER_PATTERN,
  deployFolderOf,
  readArguments,
  RELEASE_NAME_PATTERN as COPY_NAME_PATTERN,
  releaseNameOf,
  REQUIRED_FILES,
} from './open-package.mjs'

const SCRIPT = resolve(import.meta.dirname, 'open-package.mjs')
const NAME = '20261112100000-1a2b3c4'
const FOLDER = 'oxy-acme-staging-finance-dashboard-5205'

describe('the copies of the rules', () => {
  it('are the same as the rules of the project', () => {
    expect(COPY_NAME_PATTERN.source).toBe(RELEASE_NAME_PATTERN.source)
    expect(COPY_FOLDER_PATTERN.source).toBe(DEPLOY_FOLDER_PATTERN.source)
    // everything an install needs: what release.mjs requires, plus the installer itself
    expect([...REQUIRED_FILES].sort()).toEqual([...REQUIRED_RELEASE_FILES, 'scripts/ops/install.mjs'].sort())
  })
})

describe('releaseNameOf', () => {
  it('gives the file name without .tgz', () => {
    expect(releaseNameOf(`/home/oxy/uploads/${NAME}.tgz`)).toBe(NAME)
    expect(releaseNameOf(`C:\\Temp\\20261112100000-v1.2.0.tgz`.replace(/\\/g, '/'))).toBe('20261112100000-v1.2.0')
  })

  it('refuses a name that release:pack did not make', () => {
    for (const bad of ['file (1).tgz', `${NAME}.zip`, `${NAME}`, '20261112-1a2b3c4.tgz', 'release.tgz', '../x.tgz']) {
      expect(releaseNameOf(bad)).toBeNull()
    }
  })
})

describe('deployFolderOf', () => {
  it('is the folder the file sits in', () => {
    expect(deployFolderOf(`/srv/apps/${FOLDER}`)).toEqual({ root: `/srv/apps/${FOLDER}`, message: '' })
  })

  it('is the folder above releases/ for the copy inside a release', () => {
    expect(deployFolderOf(`/srv/apps/${FOLDER}/releases/${NAME}/scripts/ops`).root).toBe(`/srv/apps/${FOLDER}`)
  })

  it('refuses a folder with another name', () => {
    expect(deployFolderOf('/home/oxy/uploads').root).toBeNull()
    expect(deployFolderOf('/home/oxy/uploads').message).toContain(
      'must be named oxy-<client>-<env>-finance-dashboard-<port>',
    )
  })
})

describe('readArguments', () => {
  it('reads the file and the options that are passed on', () => {
    expect(readArguments(['a.tgz'])).toEqual({ file: 'a.tgz', passOn: [] })
    expect(readArguments(['a.tgz', '--prepare-only', '--dry-run', '--keep', '8'])).toEqual({
      file: 'a.tgz',
      passOn: ['--prepare-only', '--dry-run', '--keep', '8'],
    })
  })

  it('refuses wrong use', () => {
    for (const bad of [
      [],
      ['--dry-run'],
      ['a.tgz', '--rollback'],
      ['a.tgz', '--keep'],
      ['a.tgz', '--keep', 'many'],
      ['a.tgz', 'b.tgz'],
    ]) {
      expect(readArguments(bad)).toBeNull()
    }
  })
})

describe('open-package.mjs', { timeout: 30_000 }, () => {
  let work = ''
  let root = ''
  let uploads = ''

  beforeEach(() => {
    work = mkdtempSync(join(tmpdir(), 'open-package-'))
    root = join(work, FOLDER)
    uploads = join(work, 'uploads')
    mkdirSync(root)
    mkdirSync(uploads)
    copyFileSync(SCRIPT, join(root, 'open-package.mjs'))
  })

  afterEach(() => {
    rmSync(work, { recursive: true, force: true })
  })

  /** A package with the required files; the "installer" in it only prints its arguments and exits with `exitCode`. */
  function makePackage(name, { exitCode = 0, without = [] } = {}) {
    const stage = join(work, `stage-${name}-${without.length}`)
    const files = {
      'package.json': '{}',
      'dist/base-path.json': '{"base":"/"}',
      'dist/build-info.json': '{"version":"v0"}',
      'scripts/start-server.mjs': '',
      'scripts/ops/install.mjs': `console.log('INSTALLER ' + process.argv.slice(2).join(' ')); process.exitCode = ${exitCode}`,
    }
    for (const [file, text] of Object.entries(files)) {
      if (without.includes(file)) continue
      const full = join(stage, ...file.split('/'))
      mkdirSync(join(full, '..'), { recursive: true })
      writeFileSync(full, text)
    }
    const made = spawnSync('tar', ['-czf', `uploads/${name}.tgz`, '-C', `stage-${name}-${without.length}`, '.'], {
      cwd: work,
      encoding: 'utf8',
    })
    expect(made.status, made.stderr).toBe(0)
    return join(uploads, `${name}.tgz`)
  }

  function run(args, script = join(root, 'open-package.mjs')) {
    const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
    return { status: result.status, out: result.stdout ?? '', err: result.stderr ?? '' }
  }

  it('opens the package into releases/<name> and runs the installer, passing the options on', () => {
    const file = makePackage(NAME)
    const result = run([file, '--prepare-only', '--keep', '8'])
    expect(result.status, result.err).toBe(0)
    expect(result.out).toContain(`Opened ${NAME}.tgz into`)
    expect(result.out).toContain('INSTALLER --prepare-only --keep 8')
    expect(existsSync(join(root, 'releases', NAME, 'dist', 'build-info.json'))).toBe(true)
    expect(readdirSync(join(root, 'releases'))).toEqual([NAME])
  })

  it('creates releases/ when it does not exist yet', () => {
    expect(existsSync(join(root, 'releases'))).toBe(false)
    expect(run([makePackage(NAME)]).status).toBe(0)
    expect(existsSync(join(root, 'releases', NAME))).toBe(true)
  })

  it('installs an open release again without opening it again', () => {
    const file = makePackage(NAME)
    run([file])
    writeFileSync(join(root, 'releases', NAME, 'kept.txt'), 'x')
    const again = run([file, '--dry-run'])
    expect(again.status).toBe(0)
    expect(again.out).toContain(`The release ${NAME} is already open; it is installed again.`)
    expect(again.out).toContain('INSTALLER --dry-run')
    expect(existsSync(join(root, 'releases', NAME, 'kept.txt'))).toBe(true)
  })

  it('refuses a release folder that is incomplete, and leaves it alone', () => {
    const file = makePackage(NAME)
    mkdirSync(join(root, 'releases', NAME, 'dist'), { recursive: true })
    const result = run([file])
    expect(result.status).toBe(1)
    expect(result.err).toContain('exists but is incomplete')
    expect(result.err).toContain('rm -r')
    expect(result.out).not.toContain('INSTALLER')
  })

  it('refuses a package that is incomplete, and leaves no half-open release', () => {
    const file = makePackage(NAME, { without: ['scripts/ops/install.mjs'] })
    const result = run([file])
    expect(result.status).toBe(1)
    expect(result.err).toContain('the package is incomplete (missing scripts/ops/install.mjs)')
    expect(readdirSync(join(root, 'releases'))).toEqual([])
  })

  it('refuses a file that is not a package, and a file that does not exist', () => {
    const garbage = join(uploads, `${NAME}.tgz`)
    writeFileSync(garbage, 'not an archive')
    const broken = run([garbage])
    expect(broken.status).toBe(1)
    expect(broken.err).toContain('tar could not open the package')
    expect(existsSync(join(root, 'releases', `.tmp-${NAME}`))).toBe(false)

    expect(run([join(uploads, 'release.tgz')]).err).toContain('is not a package made by release:pack')
    expect(run([join(uploads, '20261112100001-x.tgz')]).err).toContain('does not exist')
  })

  it('gives back the exit code of the installer', () => {
    expect(run([makePackage('20261112100002-v2', { exitCode: 3 })]).status).toBe(3)
  })

  it('refuses to run from a folder that is not a deploy folder', () => {
    const elsewhere = join(work, 'somewhere')
    mkdirSync(elsewhere)
    copyFileSync(SCRIPT, join(elsewhere, 'open-package.mjs'))
    const result = run([makePackage(NAME)], join(elsewhere, 'open-package.mjs'))
    expect(result.status).toBe(1)
    expect(result.err).toContain('must sit in the deploy folder')
  })

  it('prints the usage, and refuses wrong use with exit code 2', () => {
    expect(run(['--help']).out).toContain('Usage: node <deploy folder>/open-package.mjs')
    expect(run([]).status).toBe(2)
    expect(run(['a.tgz', '--rollback']).status).toBe(2)
    expect(run(['a.tgz', '--keep', 'many']).status).toBe(2)
  })
})
