const DEFAULT_TIMEOUT_MS = 120_000
const DEFAULT_INTERVAL_MS = 2_000
const DEFAULT_STABLE_MS = 10_000
const DEFAULT_REQUEST_TIMEOUT_MS = 5_000

/** @param {unknown} error */
function describeNetworkError(error) {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : ''
  if (name === 'AbortError' || name === 'TimeoutError') return 'no answer in time'
  const cause = error && typeof error === 'object' && 'cause' in error ? error.cause : undefined
  const code =
    cause && typeof cause === 'object' && 'code' in cause
      ? String(cause.code)
      : error && typeof error === 'object' && 'code' in error
        ? String(error.code)
        : 'error'
  return `cannot connect (${code})`
}

/**
 * One question to the health address.
 * @param {{ url: string, expectVersion?: string, fetchFn: typeof fetch, requestTimeoutMs: number }} input
 * @returns {Promise<{ ok: true } | { ok: false, problem: string }>}
 */
async function probe({ url, expectVersion, fetchFn, requestTimeoutMs }) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), requestTimeoutMs)
  try {
    const response = await fetchFn(url, { signal: controller.signal, headers: { accept: 'application/json' } })
    /** @type {{ status?: unknown, version?: unknown, db?: unknown } | null} */
    let body = null
    try {
      body = await response.json()
    } catch {
      /* not JSON: reported below */
    }
    if (response.status !== 200) {
      const reasons = [`HTTP ${response.status}`]
      if (body?.db === 'fail') reasons.push('database fail')
      if (body?.status === 'degraded')
        reasons.push(`degraded, migrations ${String(body.migrations ?? 'unknown').slice(0, 20)}`)
      return { ok: false, problem: reasons.join(', ') }
    }
    if (body?.status !== 'ok') return { ok: false, problem: 'the answer does not say status ok' }
    if (expectVersion !== undefined && body.version !== expectVersion) {
      return {
        ok: false,
        problem: `another version answers (${String(body.version).slice(0, 80)}), expected ${expectVersion}`,
      }
    }
    return { ok: true }
  } catch (error) {
    return { ok: false, problem: describeNetworkError(error) }
  } finally {
    clearTimeout(timer)
  }
}

/**
 * Asks the health address until it answers well for `stableMs` in a row, or `timeoutMs` has passed.
 * @param {{
 *   url: string,
 *   expectVersion?: string,
 *   timeoutMs?: number,
 *   intervalMs?: number,
 *   stableMs?: number,
 *   requestTimeoutMs?: number,
 *   fetchFn?: typeof fetch,
 *   now?: () => number,
 *   sleep?: (ms: number) => Promise<void>,
 *   log?: (line: string) => void,
 * }} options
 * @returns {Promise<{ ok: boolean, reason: string, attempts: number }>} reason is empty on success, else the last problem
 */
export async function waitForHealth(options) {
  const {
    url,
    expectVersion,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    intervalMs = DEFAULT_INTERVAL_MS,
    stableMs = DEFAULT_STABLE_MS,
    requestTimeoutMs = DEFAULT_REQUEST_TIMEOUT_MS,
    fetchFn = fetch,
    now = Date.now,
    sleep = (/** @type {number} */ ms) => new Promise((done) => setTimeout(done, ms)),
    log = () => {},
  } = options

  const started = now()
  /** @type {number | null} */
  let healthySince = null
  let attempts = 0
  /** @type {string} */
  let problem
  for (;;) {
    attempts++
    const verdict = await probe({ url, expectVersion, fetchFn, requestTimeoutMs })
    if (verdict.ok) {
      healthySince ??= now()
      const stable = now() - healthySince
      if (stable >= stableMs) {
        log(`attempt ${attempts}: healthy`)
        return { ok: true, reason: '', attempts }
      }
      problem = `it answered well, but not yet for ${Math.round(stableMs / 1000)} seconds in a row`
      log(`attempt ${attempts}: healthy for ${Math.round(stable / 1000)} s of ${Math.round(stableMs / 1000)} s`)
    } else {
      healthySince = null
      problem = verdict.problem
      log(`attempt ${attempts}: ${problem}`)
    }
    if (now() - started >= timeoutMs) return { ok: false, reason: problem, attempts }
    await sleep(intervalMs)
  }
}
