/**
 * Sorts a thrown error into the few categories the browser may be told about. Only the category leaves the server;
 * the error itself stays in the log. Walks the cause chain because Drizzle wraps the mysql2 error. No server-only
 * marker: it is pure and unit tested.
 */
import { parsePublicError, PUBLIC_ERROR_MESSAGES, publicErrorMessage, type PublicErrorCode } from '~/lib/error-message'

/** The codes the browser may be told about (the list lives in src/lib/error-message.ts, which the browser also reads). */
export const PUBLIC_ERROR_CODES = PUBLIC_ERROR_MESSAGES
export type { PublicErrorCode }

/** The database or the network to it is not reachable (or refuses us). */
const UNAVAILABLE_CODES = new Set([
  'ECONNREFUSED',
  'ECONNRESET',
  'ENOTFOUND',
  'EAI_AGAIN',
  'ETIMEDOUT',
  'EHOSTUNREACH',
  'ENETUNREACH',
  'EPIPE',
  'PROTOCOL_CONNECTION_LOST',
  'PROTOCOL_ENQUEUE_AFTER_QUIT',
  'PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR',
  'ER_CON_COUNT_ERROR',
  'ER_SERVER_SHUTDOWN',
  'ER_ACCESS_DENIED_ERROR',
  'ER_DBACCESS_DENIED_ERROR',
  'ER_BAD_DB_ERROR',
])

/** A query was stopped because it ran too long. MySQL 5.7 reports 3024, MariaDB 1969, and a killed query 1317. */
const TIMEOUT_CODES = new Set([
  'ER_QUERY_TIMEOUT',
  'ER_STATEMENT_TIMEOUT',
  'ER_QUERY_INTERRUPTED',
  'PROTOCOL_SEQUENCE_TIMEOUT',
])
const TIMEOUT_ERRNOS = new Set([3024, 1969, 1317])

const MAX_CHAIN = 5

export function classifyError(error: unknown): PublicErrorCode {
  let current: unknown = error
  for (let depth = 0; depth < MAX_CHAIN && typeof current === 'object' && current !== null; depth++) {
    const record = current as { code?: unknown; errno?: unknown; cause?: unknown }
    if (typeof record.code === 'string') {
      if (TIMEOUT_CODES.has(record.code)) return 'TIMEOUT'
      if (UNAVAILABLE_CODES.has(record.code)) return 'DB_UNAVAILABLE'
    }
    if (typeof record.errno === 'number' && TIMEOUT_ERRNOS.has(record.errno)) return 'TIMEOUT'
    current = record.cause
  }
  return 'INTERNAL_ERROR'
}

/**
 * An error that is safe to send to the browser: its message is the code and the request id ("DB_UNAVAILABLE#2026..."),
 * and it has no stack. TanStack Start sends only the message of an error, so the id travels inside it.
 */
export function createPublicError(code: PublicErrorCode, requestId: string | undefined): Error {
  const error = new Error(publicErrorMessage(code, requestId))
  // Nothing of the server's stack may travel with a public error, whatever serializer is used.
  delete error.stack
  return error
}

/** True for an error made by createPublicError (or a plain Error whose message is a public code). */
export function isPublicError(error: unknown): error is Error {
  return parsePublicError(error) !== null
}
