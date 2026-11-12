import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { checkEnvText } from './env-rules.mjs'

const text = readFileSync(resolve(import.meta.dirname, '..', '..', '.env.example'), 'utf8')

describe('.env.example', () => {
  it('is a valid development file: known keys only, nothing required missing', () => {
    expect(checkEnvText(text, { mode: 'development' })).toMatchObject({ mode: 'development', problems: [] })
  })

  it('leaves APP_ENV out, because scripts/local.mjs sets it', () => {
    const lines = text.split(/\r?\n/).filter((line) => line.startsWith('APP_ENV='))
    expect(lines).toEqual([])
  })
})
