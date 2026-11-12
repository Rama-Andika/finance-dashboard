import { describe, expect, it, vi } from 'vitest'
import { createHealthChecker, healthResponse, isHealthRequest } from './health-core'

describe('isHealthRequest', () => {
  it('matches GET and HEAD of exactly <prefix>/health', () => {
    expect(isHealthRequest('GET', '/health', '')).toBe(true)
    expect(isHealthRequest('HEAD', '/oxy-acme-finance-dashboard/health', '/oxy-acme-finance-dashboard')).toBe(true)
  })

  it('does not match anything else', () => {
    const prefix = '/oxy-acme-finance-dashboard'
    expect(isHealthRequest('POST', `${prefix}/health`, prefix)).toBe(false)
    expect(isHealthRequest('GET', '/health', prefix)).toBe(false)
    expect(isHealthRequest('GET', `${prefix}/health/`, prefix)).toBe(false)
    expect(isHealthRequest('GET', `${prefix}/healthz`, prefix)).toBe(false)
    expect(isHealthRequest('GET', `${prefix}/login`, prefix)).toBe(false)
  })
})

describe('createHealthChecker', () => {
  const version = () => 'v1.2.0'

  it('answers 200 when the database answers', async () => {
    const check = createHealthChecker({ ping: async () => {}, version })
    expect(await check()).toEqual({ status: 200, body: { status: 'ok', version: 'v1.2.0', db: 'ok' } })
  })

  it('answers 503 when the database fails, and keeps the reason out of the answer', async () => {
    const onFailure = vi.fn()
    const check = createHealthChecker({
      ping: async () => {
        throw new Error('connect ECONNREFUSED 10.0.0.5:3306')
      },
      version,
      onFailure,
    })
    const result = await check()
    expect(result).toEqual({ status: 503, body: { status: 'fail', version: 'v1.2.0', db: 'fail' } })
    expect(JSON.stringify(result)).not.toContain('ECONNREFUSED')
    expect(onFailure).toHaveBeenCalledTimes(1)
    expect(String(onFailure.mock.calls[0]?.[0])).toContain('ECONNREFUSED')
  })

  it('answers 503 when the database does not answer in time', async () => {
    const onFailure = vi.fn()
    const check = createHealthChecker({ ping: () => new Promise<void>(() => {}), version, timeoutMs: 20, onFailure })
    expect((await check()).status).toBe(503)
    expect(String(onFailure.mock.calls[0]?.[0])).toContain('no answer within 20 ms')
  })

  it('says "unknown" when the version is not known', async () => {
    const check = createHealthChecker({ ping: async () => {}, version: () => '' })
    expect((await check()).body.version).toBe('unknown')
  })

  it('reuses a result for cacheMs and then asks again', async () => {
    let clock = 1_000
    const ping = vi.fn(async () => {})
    const check = createHealthChecker({ ping, version, cacheMs: 5_000, now: () => clock })
    await check()
    clock += 4_999
    await check()
    expect(ping).toHaveBeenCalledTimes(1)
    clock += 2
    await check()
    expect(ping).toHaveBeenCalledTimes(2)
  })

  it('lets calls that arrive together share one check', async () => {
    let release: () => void = () => {}
    const ping = vi.fn(() => new Promise<void>((done) => (release = done)))
    const check = createHealthChecker({ ping, version, cacheMs: 0 })
    const first = check()
    const second = check()
    release()
    expect(await first).toEqual(await second)
    expect(ping).toHaveBeenCalledTimes(1)
  })
})

describe('healthResponse', () => {
  const result = { status: 200 as const, body: { status: 'ok' as const, version: 'v1', db: 'ok' as const } }

  it('is JSON, never cached', async () => {
    const response = healthResponse(result, 'GET')
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toBe('application/json; charset=utf-8')
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(await response.json()).toEqual(result.body)
  })

  it('has no body for HEAD, and keeps the status of a failure', async () => {
    const down = healthResponse({ status: 503, body: { status: 'fail', version: 'v1', db: 'fail' } }, 'HEAD')
    expect(down.status).toBe(503)
    expect(await down.text()).toBe('')
  })
})
