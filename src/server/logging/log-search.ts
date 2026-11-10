import { addDays } from './log-file-name'
import type { SerializedError } from './error-serializer'
import { dayOfLogId } from './request-id'

/**
 * The search behind `npm run logs:find`: reading one log line, deciding whether it matches, and printing it.
 * Pure (no files, no pino), so it is unit tested. No server-only marker: the script loads it.
 */
export const LEVEL_RANK: Record<string, number> = { trace: 10, debug: 20, info: 30, warn: 40, error: 50, fatal: 60 }

export type LogEntry = { level: string; time: string; msg: string; [key: string]: unknown }

/** One line of a log file; null for a line that is not a JSON log entry (a partial line, a stack trace from elsewhere). */
export function parseLogLine(line: string): LogEntry | null {
  const trimmed = line.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const value: unknown = JSON.parse(trimmed)
    if (typeof value !== 'object' || value === null) return null
    const record = value as Record<string, unknown>
    if (typeof record.level !== 'string' || typeof record.time !== 'string') return null
    return { ...record, level: record.level, time: record.time, msg: typeof record.msg === 'string' ? record.msg : '' }
  } catch {
    return null
  }
}

export type SearchFilters = {
  /** A request id or job id: matches the line's reqId, jobId, parentReqId or upstreamId */
  id?: string
  /** Lowest level to show: trace, debug, info, warn, error or fatal */
  minLevel?: string
  /** "YYYY-MM-DDTHH:MM" (see parseTimeBoundary); compared with the written time of the line */
  since?: string
  until?: string
  userId?: string
  /** Lines of requests whose path starts with this text */
  path?: string
}

export function matchesFilters(entry: LogEntry, filters: SearchFilters): boolean {
  const { id } = filters
  if (id && entry.reqId !== id && entry.jobId !== id && entry.parentReqId !== id && entry.upstreamId !== id)
    return false
  if (filters.minLevel && (LEVEL_RANK[entry.level] ?? 0) < (LEVEL_RANK[filters.minLevel] ?? 0)) return false
  // Every line of a log file is written in the same zone, so the written time can be compared as text.
  if (filters.since && entry.time.slice(0, filters.since.length) < filters.since) return false
  if (filters.until && entry.time.slice(0, filters.until.length) > filters.until) return false
  if (filters.userId && entry.userId !== filters.userId) return false
  if (filters.path && !(typeof entry.path === 'string' && entry.path.startsWith(filters.path))) return false
  return true
}

/**
 * "14:30" (today), "2026-11-10 14:30", "2026-11-10T14:30:15" or "2026-11-10" become the text that `since` and `until`
 * compare with; null when the text is none of those.
 */
export function parseTimeBoundary(text: string, today: string): string | null {
  const value = text.trim().replace(' ', 'T')
  if (/^\d{2}:\d{2}(:\d{2})?$/.test(value)) return `${today}T${value}`
  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(value)) return value
  return null
}

/**
 * The days whose files must be read. A file is named after the day in the time zone of the server process, a line
 * after APP_TIMEZONE, so one day of margin is added on both sides.
 */
export function candidateDays(input: {
  id?: string
  since?: string
  until?: string
  /** How many days back to search when no time is given (1 = yesterday and today) */
  days: number
  today: string
}): { from: string; to: string } {
  const idDay = input.id ? dayOfLogId(input.id) : null
  let from: string
  let to: string
  if (idDay) {
    from = idDay
    to = idDay
  } else if (input.since || input.until) {
    from = input.since ? input.since.slice(0, 10) : addDays(input.today, -input.days)
    to = input.until ? input.until.slice(0, 10) : input.today
  } else {
    from = addDays(input.today, -input.days)
    to = input.today
  }
  return { from: addDays(from, -1), to: addDays(to, 1) }
}

/** Lines of the "err" object, indented; the cause chain follows. */
function formatError(error: unknown, indent: string): string[] {
  if (typeof error !== 'object' || error === null) return [`${indent}${String(error)}`]
  const e = error as SerializedError
  const lines: string[] = []
  const details: string[] = []
  if (e.code) details.push(`code=${e.code}`)
  if (e.errno !== undefined) details.push(`errno=${e.errno}`)
  if (e.sqlState) details.push(`sqlState=${e.sqlState}`)
  lines.push(`${indent}${e.type}: ${e.message}${details.length ? ` (${details.join(' ')})` : ''}`)
  if (e.sql) lines.push(`${indent}sql: ${e.sql}`)
  if (e.stack) for (const frame of e.stack.split('\n')) lines.push(`${indent}${frame.trim()}`)
  if (e.cause) lines.push(`${indent}caused by:`, ...formatError(e.cause, `${indent}  `))
  return lines
}

const NEVER_SHOWN = new Set(['level', 'time', 'msg', 'scope', 'client', 'err', 'clientError', 'componentStack'])
const ID_FIELDS = new Set(['reqId', 'jobId', 'parentReqId', 'upstreamId'])

/** The error a browser reported (name, message, stack), indented. */
function formatClientError(value: unknown, indent: string): string[] {
  if (typeof value !== 'object' || value === null) return []
  const e = value as { name?: unknown; message?: unknown; stack?: unknown }
  const header = `${String(e.name ?? 'Error')}: ${String(e.message ?? '')}`
  const lines = [`${indent}${header}`]
  if (typeof e.stack === 'string') {
    for (const line of e.stack.split('\n')) {
      const text = line.trim()
      if (text && text !== header) lines.push(`${indent}${text}`)
    }
  }
  return lines
}

function formatValue(value: unknown): string {
  if (typeof value === 'string') return /^[^\s"]+$/.test(value) ? value : JSON.stringify(value)
  return JSON.stringify(value)
}

/**
 * One entry as text: a header line (time, level, scope, message, fields), then the error with its stack.
 * `showIds` adds the request and job ids to the header; leave it off when the search was for one id.
 */
export function formatEntry(entry: LogEntry, options: { showIds: boolean }): string[] {
  const when = entry.time.slice(0, 23).replace('T', ' ')
  const scope = typeof entry.scope === 'string' ? entry.scope : '-'
  const fields: string[] = []
  for (const [key, value] of Object.entries(entry)) {
    if (NEVER_SHOWN.has(key) || value === undefined) continue
    if (ID_FIELDS.has(key) && !options.showIds) continue
    fields.push(`${key}=${formatValue(value)}`)
  }
  const header = `${when}  ${entry.level.toUpperCase().padEnd(5)}  ${scope}  ${entry.msg}${fields.length ? `  ${fields.join(' ')}` : ''}`
  const lines = [header]
  if (entry.err !== undefined) lines.push(...formatError(entry.err, '    '))
  if (entry.clientError !== undefined) lines.push(...formatClientError(entry.clientError, '    '))
  if (typeof entry.componentStack === 'string') {
    lines.push('    component stack:')
    for (const line of entry.componentStack.split('\n')) if (line.trim()) lines.push(`      ${line.trim()}`)
  }
  return lines
}
