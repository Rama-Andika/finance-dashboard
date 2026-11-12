import { spawnSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const DEPLOY = resolve(import.meta.dirname, 'deploy.mjs')

let work = ''
let file = ''

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'deploy-cli-'))
  file = join(work, 'targets.json')
  writeFileSync(
    file,
    JSON.stringify({
      'acme-staging': {
        ssh: 'oxy@staging.example.com',
        root: '/home/oxy/web-server/oxy-acme-staging-finance-dashboard-5205',
        timezone: 'Asia/Jakarta',
      },
      'acme-production': {
        ssh: 'oxy@erp.acme.example',
        root: '/home/oxy/web-server/oxy-acme-production-finance-dashboard-5105',
        timezone: 'Asia/Makassar',
      },
    }),
  )
})

afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

function run(args) {
  const result = spawnSync(process.execPath, [DEPLOY, ...args], { encoding: 'utf8', timeout: 60_000 })
  return { status: result.status, out: result.stdout ?? '', err: result.stderr ?? '' }
}

describe('deploy.mjs', { timeout: 30_000 }, () => {
  it('prints the usage', () => {
    const result = run(['--help'])
    expect(result.status).toBe(0)
    expect(result.out).toContain('npm run deploy -- <target>')
  })

  it('lists the targets, all of them or one environment', () => {
    const all = run(['--list-targets', '--targets', file])
    expect(all.status).toBe(0)
    expect(all.out).toContain('acme-staging  staging  oxy@staging.example.com')
    expect(all.out).toContain('acme-production  production  oxy@erp.acme.example')
    const staging = run(['--list-targets', '--env', 'staging', '--targets', file])
    expect(staging.out).toContain('acme-staging')
    expect(staging.out).not.toContain('acme-production')
  })

  it('reports a targets file with problems, and a file that is missing', () => {
    writeFileSync(file, JSON.stringify({ 'acme-staging': { ssh: 'nope' } }))
    const bad = run(['--list-targets', '--targets', file])
    expect(bad.status).toBe(1)
    expect(bad.err).toContain('targets: target "acme-staging": ssh must look like user@host')
    const missing = run(['--list-targets', '--targets', join(work, 'missing.json')])
    expect(missing.status).toBe(1)
    expect(missing.err).toContain('cannot read')
  })

  it('refuses a target that is not in the file, and tells which ones exist', () => {
    const result = run(['nobody', '--targets', file])
    expect(result.status).toBe(2)
    expect(result.err).toContain('There is no target "nobody"')
    expect(result.err).toContain('acme-staging, acme-production')
  })

  it('refuses wrong use with exit code 2', () => {
    expect(run([]).status).toBe(2)
    expect(run(['acme-staging', 'acme-production', '--targets', file]).status).toBe(2)
    expect(run(['acme-staging', '--bogus']).status).toBe(2)
    expect(run(['acme-staging', '--keep', '1', '--targets', file]).status).toBe(2)
    expect(run(['acme-staging', '--keep', 'many', '--targets', file]).status).toBe(2)
    expect(run(['acme-staging', '--rollback', '--status', '--targets', file]).status).toBe(2)
    expect(run(['acme-staging', '--rollback', '--skip-build', '--targets', file]).status).toBe(2)
    expect(run(['acme-staging', '--list-targets', '--targets', file]).status).toBe(2)
  })
})
