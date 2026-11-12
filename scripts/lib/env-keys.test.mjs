import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { APP_ENVS as APP_ENVS_TS } from '../../src/lib/core/app-env.ts'
import { CLIENT_ID_PATTERN as CLIENT_ID_PATTERN_TS } from '../../src/lib/core/client-base.ts'
import { APP_ENVS } from './app-env.mjs'
import { CLIENT_ID_PATTERN } from './env-rules.mjs'
import { DEV_ONLY_KEYS, INTERNAL_KEYS, RUNTIME_KEYS, SERVER_KEYS, knownKeysFor } from './env-keys.mjs'

const SRC = resolve(import.meta.dirname, '..', '..', 'src')

afterEach(() => {
  vi.unstubAllEnvs()
})

/** Every .ts and .tsx file below `dir` that is not a test. */
function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [full] : []
  })
}

describe('the copies kept for plain Node scripts', () => {
  it('lists the same environments as src/lib/core/app-env.ts', () => {
    expect(APP_ENVS).toEqual([...APP_ENVS_TS])
  })

  it('uses the same CLIENT_ID pattern as src/lib/core/client-base.ts', () => {
    expect(CLIENT_ID_PATTERN.source).toBe(CLIENT_ID_PATTERN_TS.source)
  })
})

describe('the list of known keys', () => {
  it('has no name twice', () => {
    const all = [...SERVER_KEYS, ...RUNTIME_KEYS, ...DEV_ONLY_KEYS, ...INTERNAL_KEYS]
    expect(new Set(all).size).toBe(all.length)
  })

  it('has exactly the keys of the schema in src/server/env.ts', async () => {
    vi.stubEnv('APP_ENV', 'development')
    vi.stubEnv('DATABASE_URL', 'mysql://u:p@127.0.0.1:3306/db')
    vi.stubEnv('SESSION_SECRET', 'x'.repeat(40))
    const { envSchema } = await import('../../src/server/env.ts')
    expect([...SERVER_KEYS].sort()).toEqual(Object.keys(envSchema.shape).sort())
  })

  it('contains every variable that the code under src/ reads', () => {
    const allowed = new Set([...SERVER_KEYS, ...RUNTIME_KEYS, ...DEV_ONLY_KEYS, ...INTERNAL_KEYS])
    const unknown = new Set()
    for (const file of sourceFiles(SRC)) {
      const text = readFileSync(file, 'utf8')
      for (const match of text.matchAll(/process\.env\.([A-Z][A-Z0-9_]*)|process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g)) {
        const name = match[1] ?? match[2]
        if (name && !allowed.has(name)) unknown.add(name)
      }
    }
    expect([...unknown]).toEqual([])
  })

  it('allows the development keys only in development', () => {
    for (const key of DEV_ONLY_KEYS) {
      expect(knownKeysFor('development')).toContain(key)
      expect(knownKeysFor('staging')).not.toContain(key)
      expect(knownKeysFor('production')).not.toContain(key)
    }
    for (const key of INTERNAL_KEYS) expect(knownKeysFor('development')).not.toContain(key)
  })
})
