/**
 * The URL prefix that a CLIENT_ID leads to: '/oxy-<id>-finance-dashboard', or '' without a client (served at the root).
 * The rule of baseUrlForClient in src/lib/core/client-base.ts, written again for plain Node scripts
 * (scripts/lib/build-prefix.test.mjs keeps the two equal).
 * @param {string | undefined} clientId
 */
export function expectedPrefix(clientId) {
  const id = (clientId ?? '').trim()
  return id === '' ? '' : `/oxy-${id}-finance-dashboard`
}

/**
 * A sentence when the build on disk was made for another prefix than the CLIENT_ID of this process gives; null when they
 * agree. Running such a server would serve its files at the wrong address, and under the wrong client name in the logs.
 * @param {{ clientId: string | undefined, builtPrefix: string }} input builtPrefix: the prefix in dist/base-path.json without its trailing slash ('' for the root)
 * @returns {string | null}
 */
export function buildMismatchMessage({ clientId, builtPrefix }) {
  const expected = expectedPrefix(clientId)
  if (expected === builtPrefix) return null
  return `CLIENT_ID does not match this build: the build was made for "${builtPrefix || '/'}" but CLIENT_ID gives "${expected || '/'}". Build again with the same CLIENT_ID (npm run build:client -- <id>), or fix CLIENT_ID in the environment file.`
}
