import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * A refresh step can hold a connection for minutes, so every module in src/server/dash that takes a connection
 * (except the quick migration runner) must take it from the refresh pool, not from the pool user requests share.
 */
const DASH_DIR = path.resolve(__dirname)
const modules = fs
  .readdirSync(DASH_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts') && f !== 'migrate.ts')
  .map((f) => ({ file: f, source: fs.readFileSync(path.join(DASH_DIR, f), 'utf8') }))

describe('refresh pool', () => {
  it('no dash module besides migrate.ts imports the shared pool', () => {
    const offenders = modules
      .filter((m) => /import\s*\{[^}]*\bpool\b[^}]*\}\s*from\s*'~\/server\/db\/client'/.test(m.source))
      .map((m) => m.file)
    expect(offenders).toEqual([])
  })

  it('every dash module that takes a connection imports the refresh pool', () => {
    const missing = modules
      .filter((m) => /\.getConnection\(/.test(m.source) && !m.source.includes("from '~/server/db/refresh-pool'"))
      .map((m) => m.file)
    expect(missing).toEqual([])
  })
})
