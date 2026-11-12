import { spawnSync } from 'node:child_process'
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const SCRIPTS = resolve(import.meta.dirname, '..')
const NAME = '20261111160000-v1.2.0'

let work = ''
let root = ''
let release = ''

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'install-cli-'))
  root = join(work, 'oxy-acme-staging-finance-dashboard-5205')
  release = join(root, 'releases', NAME)
  mkdirSync(join(release, 'dist'), { recursive: true })
  // What a package contains of the scripts: lib and ops, without the tests.
  for (const folder of ['lib', 'ops']) {
    cpSync(join(SCRIPTS, folder), join(release, 'scripts', folder), {
      recursive: true,
      filter: (source) => !/\.test\.mjs$/.test(source),
    })
  }
  writeFileSync(
    join(release, 'dist', 'build-info.json'),
    JSON.stringify({ version: 'v1.2.0', clientId: 'acme-staging' }),
  )
})

afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

function run(args, script = join(release, 'scripts', 'ops', 'install.mjs')) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  return { status: result.status, out: result.stdout ?? '', err: result.stderr ?? '' }
}

describe('install.mjs', { timeout: 30_000 }, () => {
  it('prints the usage', () => {
    const result = run(['--help'])
    expect(result.status).toBe(0)
    expect(result.out).toContain('install.mjs [--prepare-only]')
  })

  it('shows every step with --dry-run, takes no lock and runs nothing', () => {
    writeFileSync(join(root, 'finance-dashboard.env'), 'APP_ENV=staging\n')
    const result = run(['--dry-run'])
    expect(result.status, result.err).toBe(0)
    expect(result.out).toContain(`Check this release (${NAME})`)
    expect(result.out).toContain('version v1.2.0, built for acme-staging')
    expect(result.out).toContain('(dry run) would run:')
    expect(result.out).toContain('release.mjs activate')
    expect(result.out).toContain('DRY RUN finished')
    expect(existsSync(join(root, '.deploy.lock'))).toBe(false)
  })

  it('needs no environment file with --prepare-only and says what to do next', () => {
    const result = run(['--prepare-only', '--dry-run'])
    expect(result.status, result.err).toBe(0)
    expect(result.out).toContain('init-env.mjs create --client acme --env staging --port 5205')
  })

  it('refuses when the environment file is missing, and keeps the release', () => {
    const result = run([])
    expect(result.status).toBe(1)
    expect(result.out).toContain(
      'does not exist. For the first install of a deployment, run this script with --prepare-only',
    )
    expect(existsSync(join(release, 'dist', 'build-info.json'))).toBe(true)
    expect(existsSync(join(root, '.deploy.lock'))).toBe(false)
  })

  it('refuses a package that was built for another client', () => {
    writeFileSync(join(root, 'finance-dashboard.env'), 'APP_ENV=staging\n')
    writeFileSync(join(release, 'dist', 'build-info.json'), JSON.stringify({ version: 'v1.2.0', clientId: 'acme' }))
    const result = run(['--dry-run'])
    expect(result.status).toBe(1)
    expect(result.out).toContain('wrong package or wrong folder')
  })

  it('refuses to run outside a release folder', () => {
    const elsewhere = join(work, 'copy')
    cpSync(join(release, 'scripts'), join(elsewhere, 'scripts'), { recursive: true })
    const result = run([], join(elsewhere, 'scripts', 'ops', 'install.mjs'))
    expect(result.status).toBe(1)
    expect(result.err).toContain('this script must run from a release folder')
  })

  it('refuses wrong use with exit code 2', () => {
    expect(run(['--bogus']).status).toBe(2)
    expect(run(['--rollback', '--status']).status).toBe(2)
    expect(run(['--rollback', '--prepare-only']).status).toBe(2)
    expect(run(['--keep', '1']).status).toBe(2)
    expect(run(['--keep', 'many']).status).toBe(2)
    expect(run(['--status', '--dry-run']).status).toBe(2)
  })
})
