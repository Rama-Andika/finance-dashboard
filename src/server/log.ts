/**
 * Server log lines as "scope: message". The one place that writes to the console, so the format
 * stays the same everywhere. No server-only marker: it only wraps `console` and scripts load it too.
 */
export type Logger = {
  info: (message: string) => void
  warn: (message: string) => void
  /** `cause` is printed as is, so an error keeps its stack. */
  error: (message: string, cause?: unknown) => void
}

/** The text of anything that was thrown. */
export const errorText = (error: unknown): string => (error instanceof Error ? error.message : String(error))

export function createLogger(scope?: string): Logger {
  const prefix = scope ? `${scope}: ` : ''
  return {
    info: (message) => console.log(`${prefix}${message}`),
    warn: (message) => console.warn(`${prefix}${message}`),
    error: (message, cause) => {
      if (cause === undefined) console.error(`${prefix}${message}`)
      else console.error(`${prefix}${message}`, cause)
    },
  }
}
