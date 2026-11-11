import { errorReference, isPublicErrorMessage } from '~/lib/error-message'
import { CLIENT_ERROR_LIMITS, type ClientErrorReport } from './report-schema'

/** Where in the page the problem showed up. */
export type ReportContext = {
  origin: ClientErrorReport['origin']
  route: string
  componentStack?: string
  userAgent?: string
}

/** Sends one report to the server; answers the reference code the server gave it (null when it kept none). */
export type SendReport = (report: ClientErrorReport) => Promise<{ reference: string | null }>

/** One page load sends at most this many reports; a loop of errors must not become a loop of requests. */
const MAX_REPORTS_PER_PAGE = 10

function cut(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) : text
}

function toReport(error: unknown, context: ReportContext): ClientErrorReport {
  const real = error instanceof Error ? error : null
  const report: ClientErrorReport = {
    origin: context.origin,
    name: cut(real?.name || 'NonError', CLIENT_ERROR_LIMITS.name),
    message: cut(real ? real.message : String(error), CLIENT_ERROR_LIMITS.message),
    route: cut(context.route, CLIENT_ERROR_LIMITS.route),
  }
  if (real?.stack) report.stack = cut(real.stack, CLIENT_ERROR_LIMITS.stack)
  if (context.componentStack) report.componentStack = cut(context.componentStack, CLIENT_ERROR_LIMITS.componentStack)
  if (context.userAgent) report.userAgent = cut(context.userAgent, CLIENT_ERROR_LIMITS.userAgent)
  return report
}

export type ClientErrorReporter = {
  /**
   * The reference code for `error`: the request id it already carries (the server logged it), or else the id the server
   * gave when it logged this report. The same error is reported once. Never throws; null when there is no code.
   */
  report(error: unknown, context: ReportContext): Promise<string | null>
}

export function createClientErrorReporter(send: SendReport, maxReports = MAX_REPORTS_PER_PAGE): ClientErrorReporter {
  const reported = new Map<string, Promise<string | null>>()
  let sent = 0

  return {
    report(error, context) {
      const known = errorReference(error)
      if (known) return Promise.resolve(known)
      // A public error without an id (the server could not give one) was logged there; the browser adds nothing.
      if (isPublicErrorMessage(error)) return Promise.resolve(null)

      const report = toReport(error, context)
      const key = `${report.origin}|${report.name}|${report.message}|${report.route}`
      const existing = reported.get(key)
      if (existing) return existing
      if (sent >= maxReports) return Promise.resolve(null)

      sent += 1
      const promise = (async () => {
        try {
          return (await send(report)).reference
        } catch {
          return null
        }
      })()
      reported.set(key, promise)
      return promise
    },
  }
}
