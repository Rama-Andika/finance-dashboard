/**
 * Server log lines, written as one JSON object per line. The one place that creates the logger, so the format stays the
 * same everywhere. No server-only marker: it only wraps pino and scripts load it too.
 */
export { createLogger, type Logger, type LogMethod } from './logging/logger-core'
export type { LogFields } from './logging/log-fields'

/** The text of anything that was thrown. */
export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))
