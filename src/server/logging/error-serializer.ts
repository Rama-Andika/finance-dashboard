/**
 * Turns anything that was thrown into a plain object for the log, without leaking data values.
 *
 * Drizzle's "Failed query" error repeats every parameter value in its message, and a MySQL error can repeat a data value in
 * its text ("Duplicate entry '...' for key ..."). Neither text is logged: a failed query keeps its SQL (placeholders only)
 * and a database error keeps its code, errno and sqlState. The first line of a stack trace repeats the message, so only
 * the "at ..." lines of a stack are kept. No server-only marker: scripts and tests load this file.
 */
export type SerializedError = {
  type: string
  message: string
  code?: string
  errno?: number
  sqlState?: string
  /** SQL text with placeholders, never the parameter values */
  sql?: string
  /** Only the "at ..." lines */
  stack?: string
  cause?: SerializedError
}

const MAX_MESSAGE = 2000
const MAX_STACK = 8000
const MAX_SQL = 2000
const MAX_DEPTH = 4

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

/** Drizzle's failed-query error: carries the SQL and the parameter values. */
function isFailedQuery(record: Record<string, unknown>): boolean {
  return typeof record.query === 'string' && 'params' in record
}

/** A mysql2 error: ER_* code, numeric errno and an sqlState. */
function isDatabaseError(record: Record<string, unknown>): boolean {
  return (
    typeof record.errno === 'number' &&
    typeof record.code === 'string' &&
    (typeof record.sqlState === 'string' || record.code.startsWith('ER_'))
  )
}

function stackFrames(stack: string): string {
  return stack
    .split('\n')
    .filter((line) => /^\s+at /.test(line))
    .join('\n')
}

function describeNonError(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value)
  return `[${typeof value}]`
}

export function serializeError(error: unknown, depth = 0): SerializedError {
  if (!(error instanceof Error)) {
    return { type: 'NonError', message: truncate(describeNonError(error), MAX_MESSAGE) }
  }
  const record = error as unknown as Record<string, unknown>
  const out: SerializedError = { type: error.constructor?.name || error.name || 'Error', message: '' }

  if (isFailedQuery(record)) {
    out.message = 'Failed query'
    out.sql = truncate(oneLine(record.query as string), MAX_SQL)
  } else if (isDatabaseError(record)) {
    out.message = record.code as string
  } else {
    out.message = truncate(error.message, MAX_MESSAGE)
  }

  if (typeof record.code === 'string') out.code = record.code
  if (typeof record.errno === 'number') out.errno = record.errno
  if (typeof record.sqlState === 'string') out.sqlState = record.sqlState
  if (typeof error.stack === 'string') {
    const frames = stackFrames(error.stack)
    if (frames) out.stack = truncate(frames, MAX_STACK)
  }
  if (depth < MAX_DEPTH && error.cause !== undefined) out.cause = serializeError(error.cause, depth + 1)
  return out
}
