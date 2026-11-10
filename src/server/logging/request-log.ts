import type { LogFields } from './log-fields'
import { runWithLogContext, type LogContext } from './log-context'
import { createLogger } from './logger-core'
import { currentLogTimeZone } from './log-time'
import { createRequestId } from './request-id'

const log = createLogger('http')

/** The X-Request-Id of a proxy is only kept when it is short and made of safe characters. */
const UPSTREAM_ID_PATTERN = /^[A-Za-z0-9._-]{1,64}$/
const IP_PATTERN = /^[0-9a-fA-F:.]{1,45}$/
/** Search parameters of a page that are written to the access line (the page filters; never anything else). */
const LOGGED_FILTER_KEYS = ['entity', 'preset', 'from', 'to', 'p13', 'compare', 'horizon', 'inflow', 'drill']
const MAX_FILTER_VALUE = 200
const MAX_PATH = 200

export type RequestLogOptions = {
  now?: () => Date
  timeZone?: string
}

/** First address of X-Forwarded-For (start-server.mjs sets it), or undefined when it does not look like an address. */
function clientIp(request: Request): string | undefined {
  const first = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  return first && IP_PATTERN.test(first) ? first : undefined
}

/** The page filters of a page request; server function calls (path /_serverFn/...) carry their data elsewhere and get none. */
function pageFilters(url: URL): Record<string, string> | undefined {
  if (url.pathname.startsWith('/_serverFn/')) return undefined
  const filters: Record<string, string> = {}
  for (const key of LOGGED_FILTER_KEYS) {
    const value = url.searchParams.get(key)
    if (value !== null) filters[key] = value.slice(0, MAX_FILTER_VALUE)
  }
  return Object.keys(filters).length > 0 ? filters : undefined
}

/** Adds X-Request-Id to the response. A response whose headers cannot be changed (a redirect) is copied. */
function withRequestIdHeader(response: Response, reqId: string): Response {
  try {
    response.headers.set('x-request-id', reqId)
    return response
  } catch {
    const headers = new Headers(response.headers)
    headers.set('x-request-id', reqId)
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers })
  }
}

/**
 * Runs one request: gives it an id, makes the id available to every log line written meanwhile, adds it to the response
 * as X-Request-Id, and writes one access line when the response is ready. The duration is the time until the response
 * headers are ready; a streamed page keeps sending after that. An error that escapes the handler becomes a plain 500.
 */
export async function handleRequestWithLog(
  request: Request,
  handle: () => Promise<Response> | Response,
  options: RequestLogOptions = {},
): Promise<Response> {
  const startedAt = performance.now()
  const url = new URL(request.url)
  const reqId = createRequestId((options.now ?? (() => new Date()))(), options.timeZone ?? currentLogTimeZone())
  const context: LogContext = { reqId }
  const upstream = request.headers.get('x-request-id')
  if (upstream && UPSTREAM_ID_PATTERN.test(upstream)) context.upstreamId = upstream

  return runWithLogContext(context, async () => {
    let response: Response
    try {
      response = await handle()
    } catch (error) {
      log.error({ err: error }, 'request failed')
      response = new Response('Internal Server Error', {
        status: 500,
        headers: { 'content-type': 'text/plain; charset=utf-8' },
      })
    }
    const finished = withRequestIdHeader(response, reqId)

    const fields: LogFields = {
      method: request.method,
      path: url.pathname.slice(0, MAX_PATH),
      status: finished.status,
      durationMs: Math.round(performance.now() - startedAt),
    }
    const ip = clientIp(request)
    if (ip) fields.ip = ip
    if (context.fns?.length) fields.fns = context.fns
    const filters = pageFilters(url)
    if (filters) fields.filters = filters
    if (finished.status >= 500) log.error(fields, 'request')
    else log.info(fields, 'request')

    return finished
  })
}
