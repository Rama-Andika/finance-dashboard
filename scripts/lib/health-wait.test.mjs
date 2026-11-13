import { describe, expect, it } from 'vitest'
import { waitForHealth } from './health-wait.mjs'

/** A clock that only moves when the code sleeps. */
function fakeClock() {
  let time = 0
  return {
    now: () => time,
    sleep: async (ms) => {
      time += ms
    },
  }
}

const OK = { status: 200, body: { status: 'ok', version: 'v1', db: 'ok' } }
const DOWN = { status: 503, body: { status: 'fail', version: 'v1', db: 'fail' } }

/** A fetch that gives the replies in order and then repeats the last one. An Error in the list is thrown. */
function replies(list) {
  let index = 0
  return async () => {
    const item = list[Math.min(index++, list.length - 1)]
    if (item instanceof Error) throw item
    return new Response(typeof item.body === 'string' ? item.body : JSON.stringify(item.body), { status: item.status })
  }
}

function run(list, options = {}) {
  const clock = fakeClock()
  const lines = []
  const result = waitForHealth({
    url: 'http://127.0.0.1:1/health',
    timeoutMs: 20_000,
    intervalMs: 2_000,
    stableMs: 0,
    fetchFn: replies(list),
    now: clock.now,
    sleep: clock.sleep,
    log: (line) => lines.push(line),
    ...options,
  })
  return { result, lines }
}

describe('waitForHealth', () => {
  it('succeeds at once when the answer is good and no stable time is asked', async () => {
    const { result } = run([OK])
    expect(await result).toEqual({ ok: true, reason: '', attempts: 1 })
  })

  it('waits until the answers have been good for the stable time', async () => {
    const { result } = run([OK], { stableMs: 5_000 })
    expect(await result).toEqual({ ok: true, reason: '', attempts: 4 })
  })

  it('starts counting again after a bad answer', async () => {
    const { result } = run([OK, OK, DOWN, OK], { stableMs: 5_000 })
    // good at 0 and 2 s, bad at 4 s, good again from 6 s: the 5 stable seconds are reached at 12 s, the 7th attempt
    expect(await result).toEqual({ ok: true, reason: '', attempts: 7 })
  })

  it('keeps asking while the database is down and then recovers', async () => {
    const { result, lines } = run([DOWN, DOWN, OK])
    expect(await result).toEqual({ ok: true, reason: '', attempts: 3 })
    expect(lines[0]).toBe('attempt 1: HTTP 503, database fail')
  })

  it('fails with the last problem when the time runs out', async () => {
    const { result } = run([DOWN], { timeoutMs: 5_000 })
    expect(await result).toEqual({ ok: false, reason: 'HTTP 503, database fail', attempts: 4 })
  })

  it('says that a degraded answer is not healthy and why', async () => {
    const degraded = { status: 503, body: { status: 'degraded', version: 'v1', db: 'ok', migrations: 'behind' } }
    const { result, lines } = run([degraded], { timeoutMs: 0 })
    expect(await result).toEqual({ ok: false, reason: 'HTTP 503, degraded, migrations behind', attempts: 1 })
    expect(lines[0]).toBe('attempt 1: HTTP 503, degraded, migrations behind')
  })

  it('tries once with a timeout of 0', async () => {
    const { result } = run([DOWN], { timeoutMs: 0 })
    expect((await result).attempts).toBe(1)
  })

  it('refuses another version than the one expected', async () => {
    const { result } = run([OK], { expectVersion: 'v2', timeoutMs: 0 })
    expect(await result).toEqual({ ok: false, reason: 'another version answers (v1), expected v2', attempts: 1 })
    expect(await run([OK], { expectVersion: 'v1' }).result).toMatchObject({ ok: true })
  })

  it('reports a server that is not listening', async () => {
    const refused = Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNREFUSED' } })
    const { result } = run([refused], { timeoutMs: 1_000 })
    expect((await result).reason).toBe('cannot connect (ECONNREFUSED)')
  })

  it('reports an answer that is not the health answer', async () => {
    const { result } = run([{ status: 200, body: '<html>login</html>' }], { timeoutMs: 1_000 })
    expect((await result).reason).toBe('the answer does not say status ok')
  })

  it('gives up on one question that takes too long', async () => {
    const hang = (_url, { signal }) =>
      new Promise((_, reject) => {
        signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
      })
    const clock = fakeClock()
    const result = await waitForHealth({
      url: 'http://127.0.0.1:1/health',
      timeoutMs: 0,
      requestTimeoutMs: 30,
      fetchFn: hang,
      now: clock.now,
      sleep: clock.sleep,
    })
    expect(result).toEqual({ ok: false, reason: 'no answer in time', attempts: 1 })
  })
})
