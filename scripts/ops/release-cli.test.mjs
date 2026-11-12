import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const RELEASE = resolve(import.meta.dirname, 'release.mjs')
const A = '20261101100000-v1.0.0'
const B = '20261105100000-v1.1.0'
const C = '20261110100000-v1.2.0'

let work = ''
let root = ''

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'release-cli-'))
  root = join(work, 'oxy-acme-staging-finance-dashboard-5205')
  mkdirSync(join(root, 'releases'), { recursive: true })
})

afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

function run(args) {
  const result = spawnSync(process.execPath, [RELEASE, ...args], { encoding: 'utf8' })
  return { status: result.status, out: result.stdout ?? '', err: result.stderr ?? '' }
}

/** Makes a release folder with the four required files. */
function makeRelease(name, version) {
  const dir = join(root, 'releases', name)
  for (const [file, text] of Object.entries({
    'package.json': '{}',
    'dist/base-path.json': '{"base":"/"}',
    'dist/build-info.json': JSON.stringify({ version }),
    'scripts/start-server.mjs': '',
  })) {
    const full = join(dir, ...file.split('/'))
    mkdirSync(join(full, '..'), { recursive: true })
    writeFileSync(full, text)
  }
}

function deploy(name, version) {
  makeRelease(name, version)
  const activated = run(['activate', '--root', root, '--release', name])
  expect(activated.status, activated.err).toBe(0)
  return activated
}

describe('release.mjs', { timeout: 30_000 }, () => {
  it('lists nothing before the first release', () => {
    const result = run(['list', '--root', root, '--json'])
    expect(result.status).toBe(0)
    expect(JSON.parse(result.out)).toEqual({ current: null, previous: null, releases: [] })
  })

  it('activates, rolls back and lists', () => {
    expect(deploy(A, 'v1.0.0').out).toBe(`activated ${A}\nprevious none\n`)
    expect(deploy(B, 'v1.1.0').out).toBe(`activated ${B}\nprevious ${A}\n`)
    expect(run(['activate', '--root', root, '--release', B]).out).toBe(`already current ${B}\nprevious ${A}\n`)

    const listed = JSON.parse(run(['list', '--root', root, '--json']).out)
    expect(listed).toEqual({
      current: B,
      previous: A,
      releases: [
        { name: B, version: 'v1.1.0' },
        { name: A, version: 'v1.0.0' },
      ],
    })
    const text = run(['list', '--root', root]).out
    expect(text).toContain(`${B}  version v1.1.0  current`)
    expect(text).toContain(`${A}  version v1.0.0  previous`)

    const back = run(['rollback', '--root', root])
    expect(back.status).toBe(0)
    expect(back.out).toBe(`rolled back to ${A}\nfrom ${B}\n`)
    expect(JSON.parse(run(['list', '--root', root, '--json']).out).current).toBe(A)
  })

  it('cleans up with --dry-run first and then for real', () => {
    deploy(A, 'v1.0.0')
    deploy(B, 'v1.1.0')
    deploy(C, 'v1.2.0')
    // current is C and previous is B, so with keep 2 only A is old enough to go
    const dry = run(['cleanup', '--root', root, '--keep', '2', '--dry-run'])
    expect(dry.status).toBe(0)
    expect(dry.out).toContain(`would remove release ${A}`)
    expect(JSON.parse(run(['list', '--root', root, '--json']).out).releases).toHaveLength(3)
    const real = run(['cleanup', '--root', root, '--keep', '2'])
    expect(real.status).toBe(0)
    expect(real.out).toContain(`removed release ${A}`)
    expect(JSON.parse(run(['list', '--root', root, '--json']).out).releases.map((r) => r.name)).toEqual([C, B])
  })

  it('says why it failed, and exits with 1', () => {
    const noPrevious = run(['rollback', '--root', root])
    expect(noPrevious.status).toBe(1)
    expect(noPrevious.err).toContain('release: there is no previous release')
    const missing = run(['activate', '--root', root, '--release', B])
    expect(missing.status).toBe(1)
    expect(missing.err).toContain(`release: release ${B} does not exist`)
    const badKeep = run(['cleanup', '--root', root, '--keep', '1'])
    expect(badKeep.status).toBe(1)
    expect(badKeep.err).toContain('at least 2')
  })

  it('refuses wrong use with exit code 2', () => {
    expect(run([]).status).toBe(2)
    expect(run(['list']).status).toBe(2)
    expect(run(['nonsense', '--root', root]).status).toBe(2)
    expect(run(['activate', '--root', root]).status).toBe(2)
    expect(run(['list', '--root', root, '--bogus']).status).toBe(2)
  })

  it('checks the server with doctor', () => {
    const before = run(['doctor', '--root', root])
    expect(before.status).toBe(1)
    expect(before.out).toContain('FAIL  finance-dashboard.env exists next to releases/')
    expect(before.out).toContain('ok    tar can be run')
    writeFileSync(join(root, 'finance-dashboard.env'), 'APP_ENV=staging\n', { mode: 0o600 })
    const after = run(['doctor', '--root', root])
    expect(after.out).toContain('ok    finance-dashboard.env exists next to releases/')
    expect(after.status).toBe(0)
    expect(run(['doctor', '--root', join(work, 'nowhere')]).status).toBe(1)
  })
})
