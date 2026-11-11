/**
 * Where this build is served. The prefix is fixed at build time from Vite's `base` (see vite.config.ts and
 * `baseUrlForClient`), so the browser bundle and the server bundle always agree.
 * Never write an absolute path like "/summary" in a plain anchor, a cookie or a fetch: add the prefix with these helpers.
 * (TanStack Router's own `to` links and redirects already add it.)
 */
import { addPrefix, cookieNameFor, prefixFromBaseUrl, removePrefix } from '~/lib/core/client-base'

/** URL prefix without a trailing slash: '' when served at the root, otherwise '/oxy-<client>-finance-dashboard'. */
export const basePath: string = prefixFromBaseUrl(import.meta.env?.BASE_URL ?? '/')

/** Prefixes an absolute in-app path ("/summary") with the base path. */
export function withBasePath(path: string): string {
  return addPrefix(basePath, path)
}

/** Removes the base path from a URL path ("/oxy-x-finance-dashboard/summary" becomes "/summary"). */
export function stripBasePath(pathname: string): string {
  return removePrefix(basePath, pathname)
}

/** Cookie `Path`: the deployment's own prefix, so another client on the same host never receives this cookie. */
export const cookiePath: string = basePath === '' ? '/' : basePath

/**
 * Cookie name of this deployment ('nr_session' at the root, 'nr_session_oxy-<client>-finance-dashboard' under a prefix).
 * Cookies are shared by every port and path of one host, so the path alone is not enough: an old cookie of the same
 * name left by a root deployment would be read first and keep a signed-out user signed in.
 */
export function cookieName(name: string): string {
  return cookieNameFor(basePath, name)
}
