import '@tanstack/react-start/server-only'
import type { ClientErrorReport } from '~/lib/client-errors/report-schema'
import { createRateLimiter } from '~/server/auth/rate-limit'
import { createLogger } from '~/server/log'
import { currentRequestId } from '~/server/logging/log-context'

const log = createLogger('client')

/** One signed-in user may send this many reports in ten minutes; the rest are dropped without a line. */
const limiter = createRateLimiter({ max: 20, windowMs: 10 * 60_000 })

export type ClientErrorResult = {
  /** The request id of this report (also the id of its log line); null when the report was dropped */
  reference: string | null
}

/** Writes an error that the browser reported. The text is client-controlled, so it is only ever logged as data. */
export function recordClientError(userId: string, report: ClientErrorReport): ClientErrorResult {
  if (!limiter.hit(userId)) return { reference: null }
  log.error(
    {
      origin: report.origin,
      route: report.route,
      userAgent: report.userAgent,
      componentStack: report.componentStack,
      clientError: { name: report.name, message: report.message, stack: report.stack },
    },
    'client error',
  )
  return { reference: currentRequestId() ?? null }
}
