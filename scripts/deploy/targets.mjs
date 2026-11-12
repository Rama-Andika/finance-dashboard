import { readFileSync } from 'node:fs'
import { isSafeRemotePath, parseDeployFolder } from '../lib/release-layout.mjs'

/** Where the targets are written. The folder env/ is never committed. */
export const DEFAULT_TARGETS_FILE = 'env/deploy-targets.json'

const TARGET_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{0,80}$/
/** user@host: a lowercase user name, then a host name or an IPv4 address (IPv6 is not supported). */
const SSH_ADDRESS_PATTERN = /^[a-z_][a-z0-9_-]{0,31}@[A-Za-z0-9][A-Za-z0-9.-]{0,252}$/
const FIELDS = ['ssh', 'sshPort', 'root', 'timezone', 'nodePath', 'npmPath']

/**
 * @typedef {{
 *   name: string, ssh: string, sshPort: number, root: string, timezone: string, nodePath: string, npmPath: string,
 *   client: string, env: 'staging' | 'production', port: number, clientId: string, unit: string,
 * }} Target
 */

/** @param {string} name */
function isTimeZone(name) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: name })
    return true
  } catch {
    return false
  }
}

/**
 * Reads the text of a targets file. A problem names the target and the field, and never repeats a value.
 * @param {string} text
 * @returns {{ targets: Target[], problems: string[] }}
 */
export function parseTargets(text) {
  /** @type {string[]} */
  const problems = []
  /** @type {Target[]} */
  const targets = []
  let data
  try {
    data = JSON.parse(text)
  } catch {
    return { targets, problems: ['the targets file is not valid JSON'] }
  }
  if (data === null || typeof data !== 'object' || Array.isArray(data)) {
    return { targets, problems: ['the targets file must be a JSON object with one entry per target'] }
  }

  for (const [name, value] of Object.entries(data)) {
    const before = problems.length
    /** @param {string} message */
    const problem = (message) => problems.push(`target "${name}": ${message}`)
    if (!TARGET_NAME_PATTERN.test(name)) {
      problem('the name must be lowercase letters, digits and dashes')
      continue
    }
    if (value === null || typeof value !== 'object' || Array.isArray(value)) {
      problem('must be an object')
      continue
    }
    for (const key of Object.keys(value)) if (!FIELDS.includes(key)) problem(`unknown field "${key}"`)
    const { ssh, sshPort = 22, root, timezone, nodePath = '/usr/bin/node', npmPath = '/usr/bin/npm' } = value

    if (typeof ssh !== 'string' || !SSH_ADDRESS_PATTERN.test(ssh)) problem('ssh must look like user@host')
    if (!Number.isInteger(sshPort) || sshPort < 1 || sshPort > 65535)
      problem('sshPort must be a whole number from 1 to 65535')
    if (typeof timezone !== 'string' || !isTimeZone(timezone))
      problem('timezone is required and must be a time zone name such as Asia/Jakarta')
    for (const [field, path] of [
      ['nodePath', nodePath],
      ['npmPath', npmPath],
    ]) {
      if (typeof path !== 'string' || !isSafeRemotePath(path)) problem(`${field} must be a plain absolute path`)
    }
    let folder = null
    if (typeof root !== 'string' || !isSafeRemotePath(root)) {
      problem('root must be a plain absolute path')
    } else {
      folder = parseDeployFolder(root.split('/').pop() ?? '')
      if (!folder) problem('the last part of root must be oxy-<client>-<env>-finance-dashboard-<port>')
      else if (name !== `${folder.client}-${folder.env}`)
        problem(`the name must be ${folder.client}-${folder.env}, as the folder name says`)
    }
    if (problems.length > before || !folder) continue
    targets.push({ name, ssh, sshPort, root, timezone, nodePath, npmPath, ...folder })
  }
  if (targets.length === 0 && problems.length === 0) problems.push('the targets file has no targets')
  return { targets, problems }
}

/**
 * Reads and checks a targets file.
 * @param {string} file
 * @returns {{ targets: Target[], problems: string[] }}
 */
export function loadTargets(file) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'error'
    return { targets: [], problems: [`cannot read ${file} (${code})`] }
  }
  return parseTargets(text)
}
