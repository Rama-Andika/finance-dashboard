import { afterEach, describe, expect, it } from 'vitest'
import { APP_VERSION } from '~/lib/app-version/app-version'
import { noteServerFn, setLogUser } from './log-context'
import { captureLogs, createLogger, resetLoggerForTests } from './logger-core'
import { handleRequestWithLog } from './request-log'

afterEach(() => resetLoggerForTests())

const options = { now: () => new Date(Date.UTC(2026, 10, 10, 14, 35, 51, 93)), timeZone: 'Asia/Makassar' }

function pageRequest(headers: Record<string, string> = {}): Request {
  return new Request('http://localhost:3000/summary?entity=all&preset=ytd&secret=1&p13=false', {
    headers: { 'x-forwarded-for': '10.0.0.21, 10.0.0.1', ...headers },
  })
}

describe('handleRequestWithLog', () => {
  it('gives the request an id, adds it to the response, and writes one access line', async () => {
    const capture = captureLogs()
    const response = await handleRequestWithLog(
      pageRequest({ 'x-request-id': 'proxy-1' }),
      () => {
        setLogUser('17')
        noteServerFn('getCurrentUserFn')
        noteServerFn('getCurrentUserFn')
        noteServerFn('summaryHeadFn')
        createLogger('app').info({}, 'inside the request')
        return new Response('ok', { status: 200 })
      },
      options,
    )
    const entries = capture.entries()
    capture.stop()

    const reqId = response.headers.get('x-request-id')
    expect(reqId).toMatch(/^20261110-223551-[a-hjkmnp-z2-9]{5}$/)
    expect(entries).toHaveLength(2)
    expect(entries[0]).toMatchObject({ msg: 'inside the request', reqId, upstreamId: 'proxy-1' })
    expect(entries[1]).toMatchObject({
      level: 'info',
      scope: 'http',
      msg: 'request',
      reqId,
      userId: '17',
      upstreamId: 'proxy-1',
      method: 'GET',
      path: '/summary',
      status: 200,
      ip: '10.0.0.21',
      fns: ['getCurrentUserFn', 'summaryHeadFn'],
      filters: { entity: 'all', preset: 'ytd', p13: 'false' },
    })
    expect(typeof entries[1]?.durationMs).toBe('number')
    expect(JSON.stringify(entries[1])).not.toContain('secret')
  })

  it('writes no filters for a server function call', async () => {
    const capture = captureLogs()
    const request = new Request('http://localhost:3000/_serverFn/abc?payload=%7B%22entity%22%3A%22all%22%7D', {
      method: 'GET',
    })
    await handleRequestWithLog(request, () => new Response('ok'), options)
    const [entry] = capture.entries()
    capture.stop()
    expect(entry).toMatchObject({ path: '/_serverFn/abc' })
    expect(entry).not.toHaveProperty('filters')
    expect(entry).not.toHaveProperty('ip')
  })

  it('ignores an X-Request-Id that is not short and plain', async () => {
    const capture = captureLogs()
    await handleRequestWithLog(
      pageRequest({ 'x-request-id': 'bad id\twith "quotes"' }),
      () => new Response('ok'),
      options,
    )
    const [entry] = capture.entries()
    capture.stop()
    expect(entry).not.toHaveProperty('upstreamId')
  })

  it('turns an error that escapes the handler into a plain 500 with the id, and logs it with the same id', async () => {
    const capture = captureLogs()
    const response = await handleRequestWithLog(
      pageRequest(),
      () => {
        throw new Error('handler blew up')
      },
      options,
    )
    const entries = capture.entries()
    capture.stop()
    expect(response.status).toBe(500)
    expect(await response.text()).toBe('Internal Server Error')
    const reqId = response.headers.get('x-request-id')
    expect(entries.map((e) => e.level)).toEqual(['error', 'error'])
    expect(entries[0]).toMatchObject({ msg: 'request failed', reqId, err: { message: 'handler blew up' } })
    expect(entries[1]).toMatchObject({ msg: 'request', status: 500, reqId })
  })

  it('writes a 404 as an info line and a 500 response of the handler as an error line', async () => {
    const capture = captureLogs()
    await handleRequestWithLog(pageRequest(), () => new Response('missing', { status: 404 }), options)
    await handleRequestWithLog(pageRequest(), () => new Response('down', { status: 503 }), options)
    const entries = capture.entries()
    capture.stop()
    expect(entries.map((e) => e.level)).toEqual(['info', 'error'])
  })

  it('adds the version of the build as X-App-Version, also to a response whose headers cannot be changed', async () => {
    const plain = await handleRequestWithLog(pageRequest(), () => new Response('ok'), options)
    expect(plain.headers.get('x-app-version')).toBe(APP_VERSION)
    const redirect = await handleRequestWithLog(
      pageRequest(),
      () => Response.redirect('http://localhost:3000/login', 302),
      options,
    )
    expect(redirect.headers.get('x-app-version')).toBe(APP_VERSION)
  })

  it('copies a response whose headers cannot be changed (a redirect)', async () => {
    const capture = captureLogs()
    const response = await handleRequestWithLog(
      pageRequest(),
      () => Response.redirect('http://localhost:3000/login', 302),
      options,
    )
    capture.stop()
    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe('http://localhost:3000/login')
    expect(response.headers.get('x-request-id')).toMatch(/^20261110-223551-/)
  })

  it('gives every request its own id and context', async () => {
    const capture = captureLogs()
    const ids = await Promise.all(
      [1, 2, 3].map(async (n) => {
        const response = await handleRequestWithLog(
          pageRequest(),
          async () => {
            await new Promise((resolve) => setTimeout(resolve, 5 * (4 - n)))
            setLogUser(String(n))
            return new Response('ok')
          },
          options,
        )
        return response.headers.get('x-request-id')
      }),
    )
    const entries = capture.entries()
    capture.stop()
    expect(new Set(ids).size).toBe(3)
    for (const entry of entries) {
      const index = ids.indexOf(entry.reqId as string)
      expect(entry.userId).toBe(String(index + 1))
    }
  })

  describe('under a deployment prefix', () => {
    const prefixed = { ...options, basePath: '/oxy-client-a-finance-dashboard' }

    it('writes the path without the prefix, with the page filters', async () => {
      const capture = captureLogs()
      const request = new Request(
        'http://localhost:3000/oxy-client-a-finance-dashboard/summary?entity=all&preset=ytd&secret=1',
      )
      await handleRequestWithLog(request, () => new Response('ok'), prefixed)
      const [entry] = capture.entries()
      capture.stop()
      expect(entry).toMatchObject({ path: '/summary', filters: { entity: 'all', preset: 'ytd' } })
    })

    it('still recognises a server function call: no page filters', async () => {
      const capture = captureLogs()
      const request = new Request(
        'http://localhost:3000/oxy-client-a-finance-dashboard/_serverFn/abc?payload=%7B%22entity%22%3A%22all%22%7D',
      )
      await handleRequestWithLog(request, () => new Response('ok'), prefixed)
      const [entry] = capture.entries()
      capture.stop()
      expect(entry).toMatchObject({ path: '/_serverFn/abc' })
      expect(entry).not.toHaveProperty('filters')
    })

    it('writes the prefix itself as the root path', async () => {
      const capture = captureLogs()
      await handleRequestWithLog(
        new Request('http://localhost:3000/oxy-client-a-finance-dashboard'),
        () => new Response('ok'),
        prefixed,
      )
      const [entry] = capture.entries()
      capture.stop()
      expect(entry).toMatchObject({ path: '/' })
    })

    it('keeps a path outside the prefix as it is', async () => {
      const capture = captureLogs()
      await handleRequestWithLog(new Request('http://localhost:3000/other/summary'), () => new Response('ok'), prefixed)
      const [entry] = capture.entries()
      capture.stop()
      expect(entry).toMatchObject({ path: '/other/summary' })
    })

    it('keeps the full path when the prefix is empty', async () => {
      const capture = captureLogs()
      await handleRequestWithLog(new Request('http://localhost:3000/summary?entity=all'), () => new Response('ok'), {
        ...options,
        basePath: '',
      })
      const [entry] = capture.entries()
      capture.stop()
      expect(entry).toMatchObject({ path: '/summary', filters: { entity: 'all' } })
    })
  })
})
