import '@tanstack/react-start/server-only'
import { isNotFound, isRedirect } from '@tanstack/react-router'
import { createLogger } from '~/server/log'

const log = createLogger()

/** Error codes the client is allowed to see; everything else is collapsed into INTERNAL_ERROR. */
export const PUBLIC_ERROR_CODES = ['UNAUTHORIZED', 'INTERNAL_ERROR'] as const
export type PublicErrorCode = (typeof PUBLIC_ERROR_CODES)[number]

/**
 * Turns anything thrown by a server function into an error that is safe to send to the browser.
 * Raw messages (SQL text, parameters, table names, stack traces) stay in the server log only.
 * Redirects and not-found results are control flow and are returned unchanged.
 */
export function toPublicError(error: unknown, context = 'server function'): unknown {
  if (isRedirect(error) || isNotFound(error) || error instanceof Response) return error
  if (error instanceof Error && (PUBLIC_ERROR_CODES as readonly string[]).includes(error.message)) return error

  log.error(`${context} failed:`, error)
  return new Error('INTERNAL_ERROR' satisfies PublicErrorCode)
}
