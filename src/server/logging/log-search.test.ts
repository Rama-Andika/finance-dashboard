import { describe, expect, it } from 'vitest'
import {
  candidateDays,
  formatEntry,
  matchesFilters,
  parseLogLine,
  parseTimeBoundary,
  type LogEntry,
} from './log-search'

function entry(extra: Record<string, unknown> = {}): LogEntry {
  return { level: 'info', time: '2026-11-10T14:35:51.093+08:00', msg: 'request', ...extra }
}

describe('parseLogLine', () => {
  it('reads a JSON log line', () => {
    const line = '{"level":"error","time":"2026-11-10T14:35:51.093+08:00","scope":"fn","msg":"failed","reqId":"r1"}'
    expect(parseLogLine(line)).toMatchObject({ level: 'error', scope: 'fn', msg: 'failed', reqId: 'r1' })
  })

  it('answers null for a line that is not a log entry', () => {
    expect(parseLogLine('')).toBeNull()
    expect(parseLogLine('    at Object.<anonymous> (file.js:1:1)')).toBeNull()
    expect(parseLogLine('{"level":"info"')).toBeNull()
    expect(parseLogLine('{"msg":"no level or time"}')).toBeNull()
    expect(parseLogLine('[1,2]')).toBeNull()
  })
})

describe('matchesFilters', () => {
  it('matches an id against the request id, job id, parent request id and upstream id', () => {
    expect(matchesFilters(entry({ reqId: 'a' }), { id: 'a' })).toBe(true)
    expect(matchesFilters(entry({ jobId: 'a' }), { id: 'a' })).toBe(true)
    expect(matchesFilters(entry({ parentReqId: 'a' }), { id: 'a' })).toBe(true)
    expect(matchesFilters(entry({ upstreamId: 'a' }), { id: 'a' })).toBe(true)
    expect(matchesFilters(entry({ reqId: 'b' }), { id: 'a' })).toBe(false)
    expect(matchesFilters(entry(), { id: 'a' })).toBe(false)
  })

  it('shows a level and everything above it', () => {
    expect(matchesFilters(entry({ level: 'warn' }), { minLevel: 'error' })).toBe(false)
    expect(matchesFilters(entry({ level: 'error' }), { minLevel: 'error' })).toBe(true)
    expect(matchesFilters(entry({ level: 'fatal' }), { minLevel: 'error' })).toBe(true)
  })

  it('compares the time as written, to the minute or the second as given', () => {
    const at = entry() // 14:35:51
    expect(matchesFilters(at, { since: '2026-11-10T14:35' })).toBe(true)
    expect(matchesFilters(at, { since: '2026-11-10T14:36' })).toBe(false)
    expect(matchesFilters(at, { until: '2026-11-10T14:35' })).toBe(true)
    expect(matchesFilters(at, { until: '2026-11-10T14:34' })).toBe(false)
    expect(matchesFilters(at, { since: '2026-11-10', until: '2026-11-10' })).toBe(true)
    expect(matchesFilters(at, { since: '2026-11-11' })).toBe(false)
  })

  it('filters on the user and on the start of the path', () => {
    expect(matchesFilters(entry({ userId: '17' }), { userId: '17' })).toBe(true)
    expect(matchesFilters(entry({ userId: '18' }), { userId: '17' })).toBe(false)
    expect(matchesFilters(entry({ path: '/summary' }), { path: '/sum' })).toBe(true)
    expect(matchesFilters(entry({ path: '/payables' }), { path: '/sum' })).toBe(false)
    expect(matchesFilters(entry(), { path: '/sum' })).toBe(false)
  })

  it('matches everything without filters', () => {
    expect(matchesFilters(entry(), {})).toBe(true)
  })
})

describe('parseTimeBoundary', () => {
  it('turns the accepted forms into text that can be compared with the written time', () => {
    expect(parseTimeBoundary('14:30', '2026-11-10')).toBe('2026-11-10T14:30')
    expect(parseTimeBoundary('14:30:15', '2026-11-10')).toBe('2026-11-10T14:30:15')
    expect(parseTimeBoundary('2026-11-09 08:05', '2026-11-10')).toBe('2026-11-09T08:05')
    expect(parseTimeBoundary('2026-11-09T08:05:30', '2026-11-10')).toBe('2026-11-09T08:05:30')
    expect(parseTimeBoundary('2026-11-09', '2026-11-10')).toBe('2026-11-09')
  })

  it('answers null for anything else', () => {
    expect(parseTimeBoundary('yesterday', '2026-11-10')).toBeNull()
    expect(parseTimeBoundary('25', '2026-11-10')).toBeNull()
    expect(parseTimeBoundary('', '2026-11-10')).toBeNull()
  })
})

describe('candidateDays', () => {
  it('uses the day written in an id, with one day of margin', () => {
    expect(candidateDays({ id: '20261108-143551-k7q2m', days: 1, today: '2026-11-10' })).toEqual({
      from: '2026-11-07',
      to: '2026-11-09',
    })
  })

  it('uses the days of since and until, with one day of margin', () => {
    expect(
      candidateDays({ since: '2026-11-05T10:00', until: '2026-11-06T12:00', days: 1, today: '2026-11-10' }),
    ).toEqual({
      from: '2026-11-04',
      to: '2026-11-07',
    })
  })

  it('goes from since to today when there is no until', () => {
    expect(candidateDays({ since: '2026-11-08T10:00', days: 1, today: '2026-11-10' })).toEqual({
      from: '2026-11-07',
      to: '2026-11-11',
    })
  })

  it('goes back the given number of days without any time', () => {
    expect(candidateDays({ days: 1, today: '2026-11-10' })).toEqual({ from: '2026-11-08', to: '2026-11-11' })
    expect(candidateDays({ days: 7, today: '2026-11-10' })).toEqual({ from: '2026-11-02', to: '2026-11-11' })
  })

  it('treats an id that is not an id like no id', () => {
    expect(candidateDays({ id: 'hello', days: 1, today: '2026-11-10' })).toEqual({
      from: '2026-11-08',
      to: '2026-11-11',
    })
  })
})

describe('formatEntry', () => {
  it('prints a header with the time, level, scope, message and fields', () => {
    const lines = formatEntry(
      entry({
        scope: 'http',
        method: 'GET',
        path: '/summary',
        status: 200,
        durationMs: 842,
        reqId: 'r1',
        filters: { entity: 'all' },
      }),
      { showIds: false },
    )
    expect(lines).toEqual([
      '2026-11-10 14:35:51.093  INFO   http  request  method=GET path=/summary status=200 durationMs=842 filters={"entity":"all"}',
    ])
  })

  it('adds the ids only when asked', () => {
    const lines = formatEntry(entry({ reqId: 'r1', jobId: 'j1', userId: '17' }), { showIds: true })
    expect(lines[0]).toContain('reqId=r1')
    expect(lines[0]).toContain('jobId=j1')
    expect(lines[0]).toContain('userId=17')
  })

  it('quotes a value with spaces', () => {
    expect(formatEntry(entry({ reason: 'two words' }), { showIds: false })[0]).toContain('reason="two words"')
  })

  it('prints an error reported by the browser, with its component stack', () => {
    const lines = formatEntry(
      entry({
        level: 'error',
        scope: 'client',
        msg: 'client error',
        origin: 'render',
        route: '/summary',
        clientError: {
          name: 'TypeError',
          message: 'x is undefined',
          stack: 'TypeError: x is undefined\n    at BillsTable (a.js:1:1)',
        },
        componentStack: '\n    at BillsTable\n    at SummaryPage',
      }),
      { showIds: false },
    )
    expect(lines).toEqual([
      '2026-11-10 14:35:51.093  ERROR  client  client error  origin=render route=/summary',
      '    TypeError: x is undefined',
      '    at BillsTable (a.js:1:1)',
      '    component stack:',
      '      at BillsTable',
      '      at SummaryPage',
    ])
  })

  it('prints the error, its sql, stack frames and the cause chain', () => {
    const lines = formatEntry(
      entry({
        level: 'error',
        scope: 'fn',
        msg: 'server function failed',
        err: {
          type: 'DrizzleQueryError',
          message: 'Failed query',
          sql: 'SELECT 1',
          stack: '    at a (a.js:1:1)\n    at b (b.js:2:2)',
          cause: {
            type: 'Error',
            message: 'ER_BAD_FIELD_ERROR',
            code: 'ER_BAD_FIELD_ERROR',
            errno: 1054,
            sqlState: '42S22',
          },
        },
      }),
      { showIds: false },
    )
    expect(lines).toEqual([
      '2026-11-10 14:35:51.093  ERROR  fn  server function failed',
      '    DrizzleQueryError: Failed query',
      '    sql: SELECT 1',
      '    at a (a.js:1:1)',
      '    at b (b.js:2:2)',
      '    caused by:',
      '      Error: ER_BAD_FIELD_ERROR (code=ER_BAD_FIELD_ERROR errno=1054 sqlState=42S22)',
    ])
  })
})
