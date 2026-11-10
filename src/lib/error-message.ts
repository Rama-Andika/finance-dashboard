/**
 * The messages a server function error may have after it passed through toPublicError. Such an error was already
 * logged on the server. src/server/error-classify.ts uses this same list.
 */
export const PUBLIC_ERROR_MESSAGES = ['UNAUTHORIZED', 'DB_UNAVAILABLE', 'TIMEOUT', 'INTERNAL_ERROR'] as const
export type PublicErrorCode = (typeof PUBLIC_ERROR_MESSAGES)[number]

/** A request id, a job id or a proxy id: short and made of plain characters only. */
const REFERENCE_PATTERN = /^[A-Za-z0-9._-]{1,64}$/

/**
 * The message of a public error: the code, then "#" and the request id when there is one, for example
 * "DB_UNAVAILABLE#20261110-143551-k7q2m". TanStack Start sends only the message of an Error to the browser (not its
 * other properties), so the request id has to travel inside the message.
 */
export function publicErrorMessage(code: PublicErrorCode, requestId?: string): string {
  return requestId ? `${code}#${requestId}` : code
}

/** Reads a public error. Null for any other error; `reference` is null when the message carries no request id. */
export function parsePublicError(error: unknown): { code: PublicErrorCode; reference: string | null } | null {
  if (!(error instanceof Error)) return null
  const separator = error.message.indexOf('#')
  const code = separator === -1 ? error.message : error.message.slice(0, separator)
  if (!(PUBLIC_ERROR_MESSAGES as readonly string[]).includes(code)) return null
  const reference = separator === -1 ? '' : error.message.slice(separator + 1)
  return { code: code as PublicErrorCode, reference: REFERENCE_PATTERN.test(reference) ? reference : null }
}

/** True for an error that came through toPublicError, with or without a request id. */
export function isPublicErrorMessage(error: unknown): boolean {
  return parsePublicError(error) !== null
}

/** i18n key of the text for each public code. Anything else gets the caller's fallback text. */
const CODE_KEYS = new Map<PublicErrorCode, string>([
  ['UNAUTHORIZED', 'metric.sessionExpired'],
  ['DB_UNAVAILABLE', 'metric.errorDbUnavailable'],
  ['TIMEOUT', 'metric.errorTimeout'],
])

/**
 * Maps an error from a server function to an i18n key. The raw message is never shown:
 * only the public codes are recognised, anything else gets the generic text.
 */
export function errorMessageKey(error: unknown, fallbackKey: string): string {
  const parsed = parsePublicError(error)
  return (parsed && CODE_KEYS.get(parsed.code)) ?? fallbackKey
}

/**
 * The reference code of an error from a server function: the request id the server logged it under. Null when the
 * error has none (an error that happened in the browser).
 */
export function errorReference(error: unknown): string | null {
  return parsePublicError(error)?.reference ?? null
}
