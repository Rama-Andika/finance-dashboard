import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const INIT = resolve(import.meta.dirname, 'init-env.mjs')
const CHECK = resolve(import.meta.dirname, 'env-check.mjs')

let work = ''
let folder = ''
let file = ''

beforeEach(() => {
  work = mkdtempSync(join(tmpdir(), 'ops-cli-'))
  folder = join(work, 'oxy-acme-staging-finance-dashboard-5205')
  mkdirSync(folder)
  file = join(folder, 'finance-dashboard.env')
})

afterEach(() => {
  rmSync(work, { recursive: true, force: true })
})

function run(script, args) {
  const result = spawnSync(process.execPath, [script, ...args], { encoding: 'utf8' })
  return { status: result.status, out: result.stdout ?? '', err: result.stderr ?? '' }
}

function create() {
  return run(INIT, ['create', '--client', 'acme', '--env', 'staging', '--port', '5205', '--file', file])
}

describe('init-env create', () => {
  it('writes a file that env-check refuses until the database address is filled in', () => {
    const made = create()
    expect(made.status).toBe(0)
    const secret = /SESSION_SECRET=([0-9a-f]{64})/.exec(readFileSync(file, 'utf8'))?.[1]
    expect(secret).toBeDefined()
    expect(made.out + made.err).not.toContain(secret)

    const refused = run(CHECK, [file])
    expect(refused.status).toBe(1)
    expect(refused.err).toContain('ERROR DATABASE_URL: missing or empty')
    expect(refused.err.match(/^ERROR /gm)).toHaveLength(1)
    expect(refused.out + refused.err).not.toContain(secret)
  })

  it('writes a file that env-check accepts once the database address is filled in', () => {
    create()
    writeFileSync(
      file,
      readFileSync(file, 'utf8').replace(
        'DATABASE_URL=',
        'DATABASE_URL=mysql://user:topsecret@127.0.0.1:3310/acme_trial',
      ),
    )
    const accepted = run(CHECK, [file])
    expect(accepted.status).toBe(0)
    expect(accepted.out).toContain('env-check: OK (staging,')
    expect(accepted.out + accepted.err).not.toContain('topsecret')
  })

  it('does not overwrite a file that exists', () => {
    create()
    const before = readFileSync(file, 'utf8')
    const again = create()
    expect(again.status).toBe(1)
    expect(again.err).toContain('already exists')
    expect(readFileSync(file, 'utf8')).toBe(before)
  })

  it('refuses wrong input with exit code 2', () => {
    expect(run(INIT, ['create', '--client', 'acme', '--env', 'staging', '--file', file]).status).toBe(2)
    expect(run(INIT, ['create', '--client', 'Acme', '--env', 'staging', '--port', '5205', '--file', file]).status).toBe(
      2,
    )
    expect(run(INIT, ['nonsense', '--file', file]).status).toBe(2)
    expect(run(INIT, []).status).toBe(2)
  })
})

describe('init-env rotate-secret', () => {
  it('replaces only the secret', () => {
    create()
    const before = readFileSync(file, 'utf8')
    const rotated = run(INIT, ['rotate-secret', '--file', file])
    expect(rotated.status).toBe(0)
    const after = readFileSync(file, 'utf8')
    const secretBefore = /SESSION_SECRET=([0-9a-f]{64})/.exec(before)?.[1]
    const secretAfter = /SESSION_SECRET=([0-9a-f]{64})/.exec(after)?.[1]
    expect(secretAfter).toBeDefined()
    expect(secretAfter).not.toBe(secretBefore)
    expect(after.replace(secretAfter, secretBefore)).toBe(before)
    expect(rotated.out + rotated.err).not.toContain(secretAfter)
  })

  it('fails on a file that does not exist', () => {
    expect(run(INIT, ['rotate-secret', '--file', join(folder, 'missing.env')]).status).toBe(1)
  })
})

describe('env-check', () => {
  it('reports a typo and a wrong port by name, without values', () => {
    create()
    const text = readFileSync(file, 'utf8')
      .replace('DATABASE_URL=', 'DATABASE_URL=mysql://user:topsecret@127.0.0.1:3310/x')
      .replace('PORT=5205', 'PORT=5206')
      .replace('LOG_LEVEL=info', 'LOG_LEVL=topsecret')
    writeFileSync(file, text)
    const result = run(CHECK, [file])
    expect(result.status).toBe(1)
    expect(result.err).toContain('ERROR LOG_LEVL: unknown key (a typo?)')
    expect(result.err).toContain('ERROR PORT: differs from the port in the folder name')
    expect(result.out + result.err).not.toContain('topsecret')
  })

  it('checks a development file with --mode development and skips the folder checks', () => {
    const dev = join(work, 'development.env')
    writeFileSync(
      dev,
      `DATABASE_URL=mysql://u:p@127.0.0.1/demo\nSESSION_SECRET=${'a'.repeat(40)}\nTEST_TODAY=2025-10-15\n`,
    )
    const result = run(CHECK, [dev, '--mode', 'development'])
    expect(result.status).toBe(0)
    expect(result.out).not.toContain('note:')
  })

  it('says so when the file cannot be read, and refuses wrong use', () => {
    expect(run(CHECK, [join(work, 'missing.env')]).status).toBe(1)
    expect(run(CHECK, []).status).toBe(2)
    expect(run(CHECK, [file, '--mode', 'prod']).status).toBe(2)
  })
})
