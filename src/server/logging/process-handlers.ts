import { createLogger } from './logger-core'

const log = createLogger('process')

export type ProcessHandlerOptions = {
  /** Writes buffered log lines to disk */
  flush: () => void
  /** True in production: the process exits after the fatal line, and the process manager starts it again */
  exitOnFatal: boolean
  exit?: (code: number) => void
  /** Where the handlers are registered (tests pass an EventEmitter) */
  target?: Pick<NodeJS.Process, 'on'>
}

declare global {
  var __processHandlersInstalled: boolean | undefined
}

/**
 * A bug that escaped every try/catch leaves the process in a state nobody can trust. In production it is logged as
 * fatal, flushed to the file, and the process exits so the process manager (pm2, systemd) starts a clean one.
 * In development it is only logged, so one stray rejection does not stop the dev server.
 */
export function installProcessHandlers(options: ProcessHandlerOptions): void {
  const target = options.target ?? process
  if (target === process) {
    if (globalThis.__processHandlersInstalled) return
    globalThis.__processHandlersInstalled = true
  }
  const exit = options.exit ?? ((code: number) => process.exit(code))

  function onFatal(kind: 'uncaughtException' | 'unhandledRejection', error: unknown): void {
    log.fatal({ err: error, reason: kind }, options.exitOnFatal ? `${kind}; the process exits` : kind)
    options.flush()
    if (options.exitOnFatal) exit(1)
  }

  target.on('uncaughtException', (error) => onFatal('uncaughtException', error))
  target.on('unhandledRejection', (reason) => onFatal('unhandledRejection', reason))
}
