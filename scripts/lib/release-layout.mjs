import { expectedPrefix } from './build-prefix.mjs'
import { DEPLOY_FOLDER_PATTERN } from './env-rules.mjs'

/** The environment file of a deployment. It lives next to releases/, never inside a release. */
export const ENV_FILE_NAME = 'finance-dashboard.env'

/** Folder name of one release: the UTC time it was made (yyyymmddHHMMSS), a dash, then the version. */
export const RELEASE_NAME_PATTERN = /^\d{14}-[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/

/** What a release must contain before it may become the current one (paths inside the release folder, with "/"). */
export const REQUIRED_RELEASE_FILES = [
  'package.json',
  'dist/base-path.json',
  'dist/build-info.json',
  'scripts/start-server.mjs',
]

/**
 * The version as it may appear in a folder name: letters, digits, dot, underscore and dash. Anything else becomes a dash,
 * the name must start with a letter or digit, and it is at most 80 characters. An empty result becomes "unknown".
 * @param {string} version
 */
export function safeVersion(version) {
  const cleaned = String(version)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/^[^A-Za-z0-9]+/, '')
    .slice(0, 80)
  return cleaned === '' ? 'unknown' : cleaned
}

/**
 * The folder name of a new release, for example 20261111223015-v1.2.0.
 * @param {string} version the version of the build (dist/build-info.json)
 * @param {Date} now
 */
export function releaseName(version, now) {
  const stamp = now
    .toISOString()
    .replace(/\.\d+Z$/, '')
    .replace(/[-:T]/g, '')
  return `${stamp}-${safeVersion(version)}`
}

/**
 * What the name of a deployment folder says, or null when it does not follow oxy-<client>-<env>-finance-dashboard-<port>.
 * clientId is the CLIENT_ID the build of this deployment must be made with (staging adds "-staging").
 * unit is the systemd instance: the folder name without the leading "oxy-".
 * @param {string} folderName
 * @returns {{ client: string, env: 'staging' | 'production', port: number, clientId: string, unit: string } | null}
 */
export function parseDeployFolder(folderName) {
  const match = DEPLOY_FOLDER_PATTERN.exec(folderName)
  if (!match) return null
  const [, client = '', env = '', port = ''] = match
  return {
    client,
    env: env === 'staging' ? 'staging' : 'production',
    port: Number(port),
    clientId: env === 'staging' ? `${client}-staging` : client,
    unit: `oxy-finance-dashboard@${folderName.slice('oxy-'.length)}`,
  }
}

/**
 * The address a deployment answers its health check on, as seen from the server itself.
 * @param {number | string} port
 * @param {string} clientId the CLIENT_ID of the build ('' for a build for the root)
 */
export function healthUrl(port, clientId) {
  return `http://127.0.0.1:${port}${expectedPrefix(clientId)}/health`
}
