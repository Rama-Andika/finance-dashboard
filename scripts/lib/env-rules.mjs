import { isAppEnv } from './app-env.mjs'
import { parseEnvFile } from './env-file.mjs'
import { DEV_ONLY_KEYS, knownKeysFor } from './env-keys.mjs'

/** A copy of CLIENT_ID_PATTERN in src/lib/core/client-base.ts (scripts/lib/env-keys.test.mjs fails when they differ). */
export const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/** Name of the folder of one deployment on a server: oxy-<client>-<env>-finance-dashboard-<port>. */
export const DEPLOY_FOLDER_PATTERN = /^oxy-([a-z0-9][a-z0-9-]*)-(staging|production)-finance-dashboard-(\d{2,5})$/

/**
 * Checks the text of one environment file. A message names a key and never repeats a value.
 * @param {string} text
 * @param {{ mode?: string, folderName?: string }} [options]
 *   mode: the environment the file is known to be for (the local launcher passes "development"); without it the file
 *   must say so itself with APP_ENV.
 *   folderName: the name of the folder the file lives in; when it follows the deployment pattern, APP_ENV, PORT and
 *   CLIENT_ID must agree with it.
 * @returns {{ mode: string | undefined, problems: string[], notes: string[], keys: string[] }}
 */
export function checkEnvText(text, options = {}) {
  const { mode: forcedMode, folderName } = options
  const { entries, problems } = parseEnvFile(text)
  /** @type {string[]} */
  const notes = []
  const values = new Map(entries.map((entry) => [entry.key, entry.value]))
  /** @param {string} key */
  const has = (key) => (values.get(key) ?? '') !== ''

  // 1. Which environment is this file for?
  /** @type {string | undefined} */
  let mode
  const fileMode = values.get('APP_ENV')
  if (forcedMode) {
    mode = forcedMode
    if (has('APP_ENV') && fileMode !== forcedMode)
      problems.push(`APP_ENV: this file is for ${forcedMode}, but APP_ENV says something else`)
  } else if (!has('APP_ENV')) {
    problems.push('APP_ENV: missing; write APP_ENV=staging or APP_ENV=production')
  } else if (!isAppEnv(fileMode)) {
    problems.push('APP_ENV: must be development, staging or production')
  } else {
    mode = fileMode
  }

  // 2. Keys that are not allowed.
  const known = knownKeysFor(mode ?? 'production')
  for (const { key } of entries) {
    if (known.includes(key)) continue
    if (DEV_ONLY_KEYS.includes(key))
      problems.push(`${key}: only for development; remove it from a staging or production file`)
    else problems.push(`${key}: unknown key (a typo?)`)
  }

  // 3. Keys that are required.
  if (!has('DATABASE_URL')) problems.push('DATABASE_URL: missing or empty')
  if ((values.get('SESSION_SECRET') ?? '').length < 32)
    problems.push('SESSION_SECRET: missing or shorter than 32 characters')
  if (mode === 'staging' || mode === 'production') {
    const clientId = values.get('CLIENT_ID') ?? ''
    if (clientId === '') problems.push('CLIENT_ID: required in staging and production')
    else if (!CLIENT_ID_PATTERN.test(clientId))
      problems.push('CLIENT_ID: lowercase letters, digits and dashes only (at most 64 characters)')
    const port = values.get('PORT') ?? ''
    if (port === '') problems.push('PORT: required in staging and production')
    else if (!/^\d+$/.test(port) || Number(port) < 1024 || Number(port) > 65535)
      problems.push('PORT: must be a whole number from 1024 to 65535')
  }

  // 4. Rules of production (the application refuses the same settings when it starts: src/lib/core/app-env.ts).
  if (mode === 'production') {
    if (has('APP_TODAY')) problems.push('APP_TODAY: must be empty in production')
    const logLevel = values.get('LOG_LEVEL')
    if (logLevel === 'debug' || logLevel === 'trace')
      problems.push('LOG_LEVEL: debug and trace are not allowed in production')
  }

  // A note, not a problem: the installer (scripts/ops/install.mjs) already applies the migrations before it switches releases.
  if ((mode === 'staging' || mode === 'production') && values.get('AUTO_MIGRATE') === '1') {
    notes.push('AUTO_MIGRATE=1: the installer applies the migrations before the switch, so 0 is advised')
  }

  // 5. The folder of the deployment says which environment, port and client this file belongs to.
  if (folderName !== undefined) {
    const match = DEPLOY_FOLDER_PATTERN.exec(folderName)
    if (!match) {
      notes.push(
        `the folder name "${folderName}" does not follow oxy-<client>-<env>-finance-dashboard-<port>, so the folder checks were skipped`,
      )
    } else {
      const [, client = '', folderEnv = '', folderPort = ''] = match
      if (mode && mode !== folderEnv) problems.push(`APP_ENV: the folder name says ${folderEnv}`)
      if (has('PORT') && values.get('PORT') !== folderPort)
        problems.push('PORT: differs from the port in the folder name')
      const expectedClient = folderEnv === 'staging' ? `${client}-staging` : client
      if (has('CLIENT_ID') && values.get('CLIENT_ID') !== expectedClient)
        problems.push(`CLIENT_ID: the folder name expects ${expectedClient}`)
    }
  }

  return { mode, problems, notes, keys: entries.map((entry) => entry.key) }
}
