import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE = resolve(import.meta.dirname, 'package.mjs')

function run(args) {
  const result = spawnSync(process.execPath, [PACKAGE, ...args], { encoding: 'utf8', timeout: 60_000 })
  return { status: result.status, out: result.stdout ?? '', err: result.stderr ?? '' }
}

describe('package.mjs', { timeout: 30_000 }, () => {
  it('prints the usage', () => {
    const result = run(['--help'])
    expect(result.status).toBe(0)
    expect(result.out).toContain('npm run release:pack -- <client> <staging|production>')
  })

  it('refuses wrong use with exit code 2, before building anything', () => {
    expect(run([]).status).toBe(2)
    expect(run(['acme']).status).toBe(2)
    expect(run(['acme', 'development']).status).toBe(2)
    expect(run(['Acme Corp', 'production']).status).toBe(2)
    expect(run(['acme', 'production', 'extra']).status).toBe(2)
    expect(run(['acme', 'production', '--bogus']).status).toBe(2)
  })
})
