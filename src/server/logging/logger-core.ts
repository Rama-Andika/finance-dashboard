import pino, { type DestinationStream, type Logger as PinoLogger } from 'pino'
import { serializeError } from './error-serializer'
import { getLogContext } from './log-context'
import type { LogFields } from './log-fields'
import { loadDotEnvOnce } from './load-env'
import { currentLogTimeZone, formatLogTime, resetLogTimeZoneForTests } from './log-time'

/**
 * The one pino instance of the process, and where its lines go: standard output and, when file logging is started, the
 * daily log file. No server-only marker: scripts and tests load this file.
 */
export const LOG_LEVELS = ['trace', 'debug', 'info', 'warn', 'error', 'fatal', 'silent'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

/**
 * LOG_LEVEL when it is a known level, else "info". Under Vitest the logger is silent unless LOG_LEVEL is set
 * (LOG_LEVEL=debug in front of the test command shows the logs) or a test captures the lines.
 */
export function resolveLogLevel(raw: string | undefined, underTest: boolean): LogLevel {
  const known = (LOG_LEVELS as readonly string[]).includes(raw ?? '')
  if (underTest && !known) return 'silent'
  return known ? (raw as LogLevel) : 'info'
}

/** Where a finished line (JSON plus newline) is written. */
export type LineSink = { write(line: string): void }

const sinks: { file: LineSink | null; captured: string[] | null } = { file: null, captured: null }

let stdoutGuarded = false

const destination: DestinationStream = {
  write(line: string) {
    if (sinks.captured) {
      sinks.captured.push(line)
      return
    }
    if (!stdoutGuarded) {
      // A closed pipe (for example "npm start | head") must not crash the server.
      process.stdout.on('error', () => {})
      stdoutGuarded = true
    }
    process.stdout.write(line)
    sinks.file?.write(line)
  },
}

/** Fields of the running request or job, added to every line. A new object each time: pino changes what mixin returns. */
function contextFields(): Record<string, unknown> {
  const context = getLogContext()
  const out: Record<string, unknown> = {}
  if (!context) return out
  if (context.reqId) out.reqId = context.reqId
  if (context.jobId) out.jobId = context.jobId
  if (context.parentReqId) out.parentReqId = context.parentReqId
  if (context.upstreamId) out.upstreamId = context.upstreamId
  if (context.userId) out.userId = context.userId
  return out
}

let root: PinoLogger | null = null
const children = new Map<string, PinoLogger>()

/** Created on the first log call, so the environment is read after the server (or script) has loaded it. */
function getRoot(): PinoLogger {
  if (root) return root
  loadDotEnvOnce()
  const timeZone = currentLogTimeZone()
  const client = process.env.CLIENT_ID
  root = pino(
    {
      level: resolveLogLevel(process.env.LOG_LEVEL, Boolean(process.env.VITEST)),
      base: client ? { client } : null,
      messageKey: 'msg',
      timestamp: () => `,"time":"${formatLogTime(new Date(), timeZone)}"`,
      formatters: { level: (label) => ({ level: label }) },
      serializers: { err: serializeError },
      mixin: contextFields,
    },
    destination,
  )
  return root
}

function childFor(scope: string | undefined): PinoLogger {
  const key = scope ?? ''
  let child = children.get(key)
  if (!child) {
    child = scope ? getRoot().child({ scope }) : getRoot()
    children.set(key, child)
  }
  return child
}

/** One log method: `log.error({ err, fn }, 'message')`. The fields come first and may be empty; the message is plain text. */
export type LogMethod = (fields: LogFields, message: string) => void

export type Logger = Record<'trace' | 'debug' | 'info' | 'warn' | 'error' | 'fatal', LogMethod>

type MethodName = keyof Logger

function makeMethod(scope: string | undefined, level: MethodName): LogMethod {
  return (fields, message) => {
    childFor(scope)[level](fields, message)
  }
}

export function createLogger(scope?: string): Logger {
  return {
    trace: makeMethod(scope, 'trace'),
    debug: makeMethod(scope, 'debug'),
    info: makeMethod(scope, 'info'),
    warn: makeMethod(scope, 'warn'),
    error: makeMethod(scope, 'error'),
    fatal: makeMethod(scope, 'fatal'),
  }
}

/** Attaches (or with null, detaches) the daily log file. Used by file-destination.ts. */
export function setFileSink(sink: LineSink | null): void {
  sinks.file = sink
}

/** For tests: forget the logger so the next call reads the environment again. */
export function resetLoggerForTests(): void {
  root = null
  resetLogTimeZoneForTests()
  children.clear()
  sinks.file = null
  sinks.captured = null
}

/**
 * For tests: collects the lines instead of writing them. `level` defaults to debug, so every call is seen.
 * Call `stop()` when done.
 */
export function captureLogs(level: LogLevel = 'debug'): {
  lines: () => string[]
  entries: () => Record<string, unknown>[]
  stop: () => void
} {
  const lines: string[] = []
  const logger = getRoot()
  const previousLevel = logger.level
  sinks.captured = lines
  logger.level = level
  children.clear()
  return {
    lines: () => [...lines],
    entries: () => lines.map((line) => JSON.parse(line) as Record<string, unknown>),
    stop: () => {
      sinks.captured = null
      logger.level = previousLevel
      children.clear()
    },
  }
}
