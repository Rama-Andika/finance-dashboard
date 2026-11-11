/**
 * The URL prefix of one client's deployment, as pure functions without Vite or Node globals, so the build config
 * (vite.config.ts), the env check, the log code and the unit tests all use the same rules.
 */

/** Lowercase letters, digits and dashes; becomes part of the URL, so no dots, slashes or spaces. */
export const CLIENT_ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/**
 * Vite `base` for a client: `/oxy-<clientId>-finance-dashboard/` (a slash on both sides, as Vite expects),
 * or `/` when there is no client id (local development at the root).
 */
export function baseUrlForClient(clientId: string | undefined): string {
  const id = clientId?.trim()
  if (!id) return '/'
  if (!CLIENT_ID_PATTERN.test(id)) {
    throw new Error('CLIENT_ID must be lowercase letters, digits and dashes (at most 64 characters)')
  }
  return `/oxy-${id}-finance-dashboard/`
}

/** '/oxy-x-finance-dashboard/' becomes '/oxy-x-finance-dashboard'; '/' (or '') becomes ''. */
export function prefixFromBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '')
}

/** Puts the prefix in front of an in-app path: ('/p', '/summary') gives '/p/summary'; an empty prefix changes nothing. */
export function addPrefix(prefix: string, path: string): string {
  return `${prefix}${path.startsWith('/') ? path : `/${path}`}`
}

/**
 * Cookie name for a deployment: the plain name at the root, otherwise the name plus the prefix without its slash
 * ('/p' and 'nr_session' give 'nr_session_p'). Another deployment on the same host, or an older cookie of the same
 * name with another path, is then never read by mistake.
 */
export function cookieNameFor(prefix: string, name: string): string {
  return prefix === '' ? name : `${name}_${prefix.slice(1)}`
}

/**
 * Removes the prefix from a URL path: ('/p', '/p/summary') gives '/summary' and ('/p', '/p') gives '/'.
 * A path that is not inside the prefix (including '/px/summary' for the prefix '/p') is returned unchanged.
 */
export function removePrefix(prefix: string, pathname: string): string {
  if (prefix === '') return pathname
  if (pathname === prefix) return '/'
  return pathname.startsWith(`${prefix}/`) ? pathname.slice(prefix.length) : pathname
}
