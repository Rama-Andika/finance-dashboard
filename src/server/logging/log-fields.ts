/**
 * The fields a log call may carry next to its message. The list is closed on purpose: a typo such as "user_id" fails the
 * type check instead of creating a second spelling that `npm run logs:find` cannot see. Add a field here before using it.
 * The fields of the request or job (reqId, jobId, parentReqId, upstreamId, userId, client, scope) are added automatically
 * and are not listed here. No server-only marker: scripts and tests load this file.
 */
export type LogFields = {
  /** The thrown value; written as an object (type, message, code, errno, sqlState, sql, stack, cause) by serializeError */
  err?: unknown
  /** Free detail text that is not an error object */
  reason?: string
  /** Short stable name of what was measured or checked */
  label?: string
  durationMs?: number
  /** SQL text with placeholders, never parameter values */
  sql?: string
  /** Name of the server function */
  fn?: string
  /** The code the browser received instead of the raw error: UNAUTHORIZED, DB_UNAVAILABLE, TIMEOUT or INTERNAL_ERROR */
  publicCode?: string
  /** True for work nobody waits for (a cache reload in the background) */
  background?: boolean
  cacheKey?: string
  /** Who started a refresh run: scheduler or manual */
  source?: string
  ok?: boolean
  // The access line of a request
  method?: string
  path?: string
  status?: number
  ip?: string
  /** Server functions called during the request */
  fns?: string[]
  /** The page filters of the request (entity, preset, from, to, ...) */
  filters?: Record<string, string>
  // A failed login: the typed name is never written, only a short hash and its length
  usernameHash?: string
  usernameLength?: number
  // A report from the browser
  origin?: string
  route?: string
  componentStack?: string
  userAgent?: string
  clientError?: { name: string; message: string; stack?: string }
}
