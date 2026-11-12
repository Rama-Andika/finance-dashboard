import { describe, expect, it } from 'vitest'
import { APP_ENVS, envRuleViolations, isAppEnv, isLocalDatabaseUrl } from './app-env'

describe('isAppEnv', () => {
  it('accepts the three environments and nothing else', () => {
    expect([...APP_ENVS]).toEqual(['development', 'staging', 'production'])
    for (const name of APP_ENVS) expect(isAppEnv(name)).toBe(true)
    for (const other of ['', 'prod', 'dev', 'Production', undefined, null, 1]) expect(isAppEnv(other)).toBe(false)
  })
})

describe('isLocalDatabaseUrl', () => {
  it.each([
    'mysql://u:p@localhost:3306/demo',
    'mysql://u:p@127.0.0.1:3306/demo',
    'mysql://u:p@[::1]:3306/demo',
    'mysql://u:p@LOCALHOST/demo',
  ])('treats %s as local', (url) => {
    expect(isLocalDatabaseUrl(url)).toBe(true)
  })

  it.each(['mysql://u:p@192.168.10.99:3310/demo', 'mysql://u:p@db.example.com/demo', 'not a url', ''])(
    'treats %s as not local',
    (url) => {
      expect(isLocalDatabaseUrl(url)).toBe(false)
    },
  )
})

describe('envRuleViolations', () => {
  const base = {
    appEnv: 'staging',
    databaseUrl: 'mysql://u:p@db.example.com/x',
    appToday: undefined,
    logLevel: 'info',
  } as const

  it('allows a normal staging setup, even with APP_TODAY and debug logs', () => {
    expect(envRuleViolations(base)).toEqual([])
    expect(envRuleViolations({ ...base, appToday: '2025-10-15', logLevel: 'debug' })).toEqual([])
  })

  it('development refuses a database that is not on this computer', () => {
    expect(envRuleViolations({ ...base, appEnv: 'development' })).toHaveLength(1)
    expect(envRuleViolations({ ...base, appEnv: 'development', databaseUrl: 'mysql://u:p@127.0.0.1/x' })).toEqual([])
  })

  it('production refuses APP_TODAY', () => {
    expect(envRuleViolations({ ...base, appEnv: 'production', appToday: '2025-10-15' })).toEqual([
      expect.stringContaining('APP_TODAY'),
    ])
  })

  it('production refuses debug and trace logs, but allows the other levels', () => {
    for (const logLevel of ['debug', 'trace']) {
      expect(envRuleViolations({ ...base, appEnv: 'production', logLevel })).toEqual([
        expect.stringContaining('LOG_LEVEL'),
      ])
    }
    for (const logLevel of ['info', 'warn', 'error', 'silent']) {
      expect(envRuleViolations({ ...base, appEnv: 'production', logLevel })).toEqual([])
    }
  })

  it('reports every broken rule', () => {
    const problems = envRuleViolations({ ...base, appEnv: 'production', appToday: '2025-10-15', logLevel: 'trace' })
    expect(problems).toHaveLength(2)
  })

  it('never repeats a value in its messages', () => {
    const problems = envRuleViolations({
      appEnv: 'development',
      databaseUrl: 'mysql://someone:secret-password@db.example.com/x',
      appToday: undefined,
      logLevel: 'info',
    })
    const text = problems.join(' ')
    expect(text).not.toContain('secret-password')
    expect(text).not.toContain('db.example.com')
    expect(text).not.toContain('someone')
  })
})
