import { describe, expect, it } from 'vitest'
import { checkEnvText, DEPLOY_FOLDER_PATTERN } from './env-rules.mjs'

const SECRET = 'a'.repeat(40)

/** The text of a valid staging file; a test changes one thing in it. */
function stagingFile(overrides = {}) {
  const values = {
    APP_ENV: 'staging',
    NODE_ENV: 'production',
    CLIENT_ID: 'acme-staging',
    PORT: '5205',
    HOST: '127.0.0.1',
    TRUST_PROXY: '1',
    DATABASE_URL: 'mysql://user:topsecret@127.0.0.1:3310/acme_trial',
    SESSION_SECRET: SECRET,
    ...overrides,
  }
  return Object.entries(values)
    .filter(([, value]) => value !== null)
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')
}

const FOLDER = 'oxy-acme-staging-finance-dashboard-5205'

describe('checkEnvText', () => {
  it('accepts a valid staging file, also in the folder it belongs to', () => {
    expect(checkEnvText(stagingFile())).toMatchObject({ mode: 'staging', problems: [], notes: [] })
    expect(checkEnvText(stagingFile(), { folderName: FOLDER })).toMatchObject({ problems: [], notes: [] })
  })

  it('accepts a valid production file', () => {
    const text = stagingFile({ APP_ENV: 'production', CLIENT_ID: 'acme', PORT: '5105' })
    expect(checkEnvText(text, { folderName: 'oxy-acme-production-finance-dashboard-5105' }).problems).toEqual([])
  })

  it('reports an unknown key (a typo) by name', () => {
    const { problems } = checkEnvText(stagingFile({ DB_POOL_SZIE: '5' }))
    expect(problems).toEqual(['DB_POOL_SZIE: unknown key (a typo?)'])
  })

  it('refuses development-only keys in a staging file', () => {
    const { problems } = checkEnvText(stagingFile({ TEST_DATABASE_URL: 'mysql://x' }))
    expect(problems).toEqual(['TEST_DATABASE_URL: only for development; remove it from a staging or production file'])
  })

  it('refuses a key that the program sets itself', () => {
    const { problems } = checkEnvText(stagingFile({ APP_VERSION: 'v1' }))
    expect(problems).toEqual(['APP_VERSION: unknown key (a typo?)'])
  })

  it('needs APP_ENV in a file that does not know its environment', () => {
    expect(checkEnvText(stagingFile({ APP_ENV: null })).problems[0]).toMatch(/^APP_ENV: missing/)
    expect(checkEnvText(stagingFile({ APP_ENV: 'prod' })).problems[0]).toMatch(/^APP_ENV: must be/)
  })

  it('requires the database, the secret, the client and the port in staging and production', () => {
    const text = stagingFile({ DATABASE_URL: '', SESSION_SECRET: 'short', CLIENT_ID: null, PORT: null })
    expect(checkEnvText(text).problems).toEqual([
      'DATABASE_URL: missing or empty',
      'SESSION_SECRET: missing or shorter than 32 characters',
      'CLIENT_ID: required in staging and production',
      'PORT: required in staging and production',
    ])
  })

  it('checks the shape of CLIENT_ID and PORT', () => {
    expect(checkEnvText(stagingFile({ CLIENT_ID: 'Acme.Staging' })).problems).toEqual([
      'CLIENT_ID: lowercase letters, digits and dashes only (at most 64 characters)',
    ])
    for (const port of ['80', '70000', 'abc', '52.5']) {
      expect(checkEnvText(stagingFile({ PORT: port })).problems).toEqual([
        'PORT: must be a whole number from 1024 to 65535',
      ])
    }
  })

  it('applies the rules of production', () => {
    const text = stagingFile({ APP_ENV: 'production', CLIENT_ID: 'acme', APP_TODAY: '2025-10-15', LOG_LEVEL: 'debug' })
    expect(checkEnvText(text).problems).toEqual([
      'APP_TODAY: must be empty in production',
      'LOG_LEVEL: debug and trace are not allowed in production',
    ])
    expect(checkEnvText(stagingFile({ APP_TODAY: '2025-10-15', LOG_LEVEL: 'debug' })).problems).toEqual([])
  })

  it('checks the file against the folder name', () => {
    expect(checkEnvText(stagingFile({ PORT: '5206' }), { folderName: FOLDER }).problems).toEqual([
      'PORT: differs from the port in the folder name',
    ])
    expect(checkEnvText(stagingFile({ CLIENT_ID: 'acme' }), { folderName: FOLDER }).problems).toEqual([
      'CLIENT_ID: the folder name expects acme-staging',
    ])
    const production = stagingFile({ APP_ENV: 'production', CLIENT_ID: 'acme', PORT: '5205' })
    expect(checkEnvText(production, { folderName: FOLDER }).problems).toEqual([
      'APP_ENV: the folder name says staging',
      'CLIENT_ID: the folder name expects acme-staging',
    ])
  })

  it('skips the folder checks, with a note, when the folder name has another shape', () => {
    const result = checkEnvText(stagingFile(), { folderName: 'something-else' })
    expect(result.problems).toEqual([])
    expect(result.notes).toHaveLength(1)
  })

  it('knows the environment from the caller (the local launcher) and then allows development keys', () => {
    const text = [
      'DATABASE_URL=mysql://u:p@127.0.0.1/demo',
      `SESSION_SECRET=${SECRET}`,
      'TEST_TODAY=2025-10-15',
      'CLIENT_ID=',
    ].join('\n')
    expect(checkEnvText(text, { mode: 'development' })).toMatchObject({ mode: 'development', problems: [] })
    const problems = checkEnvText(`${text}\nAPP_ENV=staging`, { mode: 'development' }).problems
    expect(problems).toEqual(['APP_ENV: this file is for development, but APP_ENV says something else'])
  })

  it('reports the problems of the syntax too', () => {
    expect(checkEnvText(`${stagingFile()}\nPORT=1`).problems).toEqual(['line 9: PORT is already set on line 4'])
  })

  it('never repeats a value in a message', () => {
    const text = stagingFile({
      DATABASE_URL: 'mysql://user:topsecret@127.0.0.1/x',
      BAD_KEY: 'topsecret',
      SESSION_SECRET: 'topsecret',
    })
    const { problems } = checkEnvText(text)
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.join('\n')).not.toContain('topsecret')
  })

  it('notes, but does not refuse, AUTO_MIGRATE=1 in staging and production', () => {
    const result = checkEnvText(stagingFile({ AUTO_MIGRATE: '1' }))
    expect(result.problems).toEqual([])
    expect(result.notes).toEqual([
      'AUTO_MIGRATE=1: the deploy script applies the migrations before the switch, so 0 is advised',
    ])
    expect(checkEnvText(stagingFile({ AUTO_MIGRATE: '0' })).notes).toEqual([])
  })

  it('has a folder pattern that reads client, environment and port', () => {
    expect(DEPLOY_FOLDER_PATTERN.exec('oxy-acme-corp-production-finance-dashboard-5105')?.slice(1)).toEqual([
      'acme-corp',
      'production',
      '5105',
    ])
    expect(DEPLOY_FOLDER_PATTERN.test('oxy-acme-development-finance-dashboard-5105')).toBe(false)
  })
})
