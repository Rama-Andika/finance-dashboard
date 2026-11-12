/**
 * The health answer of the application: GET <prefix>/health. It needs no sign-in and says nothing but the status, the
 * version of the build and whether the database answers. No server-only marker: it holds no secret and is unit tested.
 */
export type HealthBody = { status: 'ok' | 'fail'; version: string; db: 'ok' | 'fail' }
export type HealthResult = { status: 200 | 503; body: HealthBody }

/** How long the database may take to answer before it counts as down. */
export const HEALTH_PING_TIMEOUT_MS = 3_000
/** A result is reused this long, so that callers from outside cannot make the database work on every request. */
export const HEALTH_CACHE_MS = 5_000

/** A request for the health address: GET or HEAD of exactly <prefix>/health. */
export function isHealthRequest(method: string, pathname: string, basePrefix: string): boolean {
  return (method === 'GET' || method === 'HEAD') && pathname === `${basePrefix}/health`
}

/** Runs the ping with a time limit; true when it finished in time without an error. */
async function pingWithin(
  ping: () => Promise<void>,
  timeoutMs: number,
  onFailure: ((error: unknown) => void) | undefined,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs)
  })
  try {
    await Promise.race([ping(), limit])
    return true
  } catch (error) {
    onFailure?.(error)
    return false
  } finally {
    clearTimeout(timer)
  }
}

export type HealthCheckerOptions = {
  /** Resolves when the database answers, rejects when it does not. */
  ping: () => Promise<void>
  /** The version of the build (empty when unknown). */
  version: () => string
  timeoutMs?: number
  cacheMs?: number
  now?: () => number
  /** Called with the reason when a check fails (for the log). Never sent to the caller of the address. */
  onFailure?: (error: unknown) => void
}

/**
 * A function that answers the health question. Calls that arrive while a check runs share it, and a finished result is
 * reused for `cacheMs`.
 */
export function createHealthChecker(options: HealthCheckerOptions): () => Promise<HealthResult> {
  const {
    ping,
    version,
    timeoutMs = HEALTH_PING_TIMEOUT_MS,
    cacheMs = HEALTH_CACHE_MS,
    now = Date.now,
    onFailure,
  } = options
  let cached: { at: number; result: HealthResult } | undefined
  let running: Promise<HealthResult> | undefined
  return () => {
    if (cached && now() - cached.at < cacheMs) return Promise.resolve(cached.result)
    running ??= (async (): Promise<HealthResult> => {
      const dbOk = await pingWithin(ping, timeoutMs, onFailure)
      const result: HealthResult = {
        status: dbOk ? 200 : 503,
        body: { status: dbOk ? 'ok' : 'fail', version: version() || 'unknown', db: dbOk ? 'ok' : 'fail' },
      }
      cached = { at: now(), result }
      return result
    })().finally(() => {
      running = undefined
    })
    return running
  }
}

/** The HTTP response for a result. A HEAD request gets the headers and no body. */
export function healthResponse(result: HealthResult, method: string): Response {
  return new Response(method === 'HEAD' ? null : JSON.stringify(result.body), {
    status: result.status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  })
}
