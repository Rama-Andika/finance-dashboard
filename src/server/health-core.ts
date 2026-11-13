/**
 * The health answer of the application: GET <prefix>/health. It needs no sign-in and says nothing but the status, the
 * version of the build, whether the database answers and whether the dash_* migrations are applied ("degraded" when some
 * are not). No server-only marker: it holds no secret and is unit tested.
 */
export type HealthBody = {
  status: 'ok' | 'degraded' | 'fail'
  version: string
  db: 'ok' | 'fail'
  /** ok: every dash_* migration is applied; behind: some are not; unknown: it could not be checked. */
  migrations: 'ok' | 'behind' | 'unknown'
}
export type HealthResult = { status: 200 | 503; body: HealthBody }

/** How long the database may take to answer before it counts as down. */
export const HEALTH_PING_TIMEOUT_MS = 3_000
/** A result is reused this long, so that callers from outside cannot make the database work on every request. */
export const HEALTH_CACHE_MS = 5_000

/** A request for the health address: GET or HEAD of exactly <prefix>/health. */
export function isHealthRequest(method: string, pathname: string, basePrefix: string): boolean {
  return (method === 'GET' || method === 'HEAD') && pathname === `${basePrefix}/health`
}

/** Runs a task with a time limit; says whether it finished in time without an error, and what it returned. */
async function within<T>(
  task: () => Promise<T>,
  timeoutMs: number,
  onFailure: ((error: unknown) => void) | undefined,
): Promise<{ ok: true; value: T } | { ok: false }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`no answer within ${timeoutMs} ms`)), timeoutMs)
  })
  try {
    return { ok: true, value: await Promise.race([task(), limit]) }
  } catch (error) {
    onFailure?.(error)
    return { ok: false }
  } finally {
    clearTimeout(timer)
  }
}

export type HealthCheckerOptions = {
  /** Resolves when the database answers, rejects when it does not. */
  ping: () => Promise<void>
  /** Resolves true when some dash_* migration is not applied yet, false when all are; rejects when that cannot be told. */
  migrationsBehind: () => Promise<boolean>
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
    migrationsBehind,
    version,
    timeoutMs = HEALTH_PING_TIMEOUT_MS,
    cacheMs = HEALTH_CACHE_MS,
    now = Date.now,
    onFailure,
  } = options
  /** The answer: the database first, and only when it answers, the migrations. */
  async function answer(): Promise<HealthResult> {
    const v = version() || 'unknown'
    const db = await within(ping, timeoutMs, onFailure)
    if (!db.ok) return { status: 503, body: { status: 'fail', version: v, db: 'fail', migrations: 'unknown' } }
    const migrations = await within(migrationsBehind, timeoutMs, onFailure)
    if (!migrations.ok)
      return { status: 503, body: { status: 'degraded', version: v, db: 'ok', migrations: 'unknown' } }
    if (migrations.value)
      return { status: 503, body: { status: 'degraded', version: v, db: 'ok', migrations: 'behind' } }
    return { status: 200, body: { status: 'ok', version: v, db: 'ok', migrations: 'ok' } }
  }
  let cached: { at: number; result: HealthResult } | undefined
  let running: Promise<HealthResult> | undefined
  return () => {
    if (cached && now() - cached.at < cacheMs) return Promise.resolve(cached.result)
    running ??= (async (): Promise<HealthResult> => {
      const result = await answer()
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
