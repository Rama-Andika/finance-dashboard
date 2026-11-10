import '@tanstack/react-start/server-only'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { parsePublicError } from '~/lib/error-message'
import { classifyError, createPublicError, PUBLIC_ERROR_CODES, type PublicErrorCode } from '~/server/error-classify'
import { createLogger } from '~/server/log'
import { currentRequestId } from '~/server/logging/log-context'

const log = createLogger('fn')

export { PUBLIC_ERROR_CODES, type PublicErrorCode }

/**
 * Turns anything thrown by a server function into an error that is safe to send to the browser: a message made of a
 * code and the request id ("DB_UNAVAILABLE#20261110-143551-k7q2m") and no stack trace. The raw error (SQL text,
 * parameters, table names, stack) goes to the log only, under the same request id, so the code on the screen leads
 * straight to it. `fn` is the name of the server function.
 * Redirects, not-found results and Responses are control flow and are returned unchanged.
 */
export function toPublicError(error: unknown, fn = 'server function'): unknown {
  if (isRedirect(error) || isNotFound(error) || error instanceof Response) return error

  const parsed = parsePublicError(error)
  if (parsed) {
    // Already safe. One that carries no request id yet (a plain Error('UNAUTHORIZED')) is rebuilt with it, without its stack.
    return parsed.reference ? error : createPublicError(parsed.code, currentRequestId())
  }

  const publicCode = classifyError(error)
  log.error({ err: error, fn, publicCode }, 'server function failed')
  return createPublicError(publicCode, currentRequestId())
}
