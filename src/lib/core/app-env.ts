/**
 * The three environments the application runs in, and the rules that keep one of them from being mistaken for another.
 * Pure functions without Node globals: src/server/env.ts and the tests use them, and scripts/lib/app-env.mjs keeps a copy of
 * the list for plain Node scripts (a test fails when the two lists differ).
 */

/** development = a developer's computer; staging = the test server; production = the live server of a client. */
export const APP_ENVS = ['development', 'staging', 'production'] as const
export type AppEnv = (typeof APP_ENVS)[number]

export function isAppEnv(value: unknown): value is AppEnv {
  return typeof value === 'string' && (APP_ENVS as readonly string[]).includes(value)
}

const LOCAL_HOSTS = ['localhost', '127.0.0.1', '::1']

/** True when the host of a database URL is this computer. An address that cannot be read counts as not local. */
export function isLocalDatabaseUrl(databaseUrl: string): boolean {
  try {
    // new URL('mysql://u:p@[::1]:3306/db').hostname is '[::1]': the brackets are removed before comparing.
    const host = new URL(databaseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '')
    return LOCAL_HOSTS.includes(host)
  } catch {
    return false
  }
}

export type EnvRuleInput = {
  appEnv: AppEnv
  databaseUrl: string
  appToday: string | undefined
  logLevel: string
}

/**
 * The settings that break a rule of their environment, one short sentence each. A sentence names the variable and never
 * repeats its value (DATABASE_URL holds a password). An empty list means the settings are allowed.
 *  - development: the database must be on this computer;
 *  - production: APP_TODAY must be empty (it freezes "today" and silently shifts every figure) and LOG_LEVEL may not be
 *    debug or trace.
 */
export function envRuleViolations(input: EnvRuleInput): string[] {
  const problems: string[] = []
  if (input.appEnv === 'development' && !isLocalDatabaseUrl(input.databaseUrl)) {
    problems.push('DATABASE_URL: development may only use a database on this computer (localhost, 127.0.0.1 or ::1)')
  }
  if (input.appEnv === 'production') {
    if (input.appToday) problems.push('APP_TODAY: must be empty in production (it freezes "today" for every user)')
    if (input.logLevel === 'debug' || input.logLevel === 'trace') {
      problems.push('LOG_LEVEL: debug and trace are not allowed in production')
    }
  }
  return problems
}
