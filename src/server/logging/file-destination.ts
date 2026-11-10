import { readdir, unlink } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import buildRollingStream, { type RollingStream } from 'pino-roll'
import { loadDotEnvOnce } from './load-env'
import { cutoffDay, LOG_FILE_BASE, LOG_FILE_PATTERN } from './log-file-name'
import { setFileSink, type LineSink } from './logger-core'
import { currentLogTimeZone, logDay } from './log-time'

/**
 * The daily log file: "<LOG_DIR>/app.<yyyy-MM-dd>.<n>.log". pino-roll starts a new file at midnight of the time zone
 * of the server process (set TZ to the same zone as APP_TIMEZONE); every line inside carries its own time and offset.
 * A failure of the file never stops the server: the lines then go to standard output only, and opening is retried.
 * No server-only marker: scripts and tests load this file.
 */
/** Lines kept in memory while the file is being opened. */
const MAX_PENDING_LINES = 2000
/** After a failure, wait this long before opening the file again. */
const REOPEN_DELAY_MS = 60_000
const PRUNE_EVERY_MS = 6 * 60 * 60 * 1000
const DEFAULT_RETENTION_DAYS = 30

export type BuildStream = typeof buildRollingStream

export type FileSinkOptions = {
  dir: string
  build?: BuildStream
  /** Called once per failure; the default writes one line to standard error. */
  onProblem?: (message: string) => void
  reopenDelayMs?: number
}

export type FileSink = LineSink & {
  /** Writes what is buffered to disk now (used just before the process exits). */
  flush(): void
  /** Resolves when the current attempt to open the file is over (for tests). */
  whenOpen(): Promise<void>
}

export function createFileSink(options: FileSinkOptions): FileSink {
  const build = options.build ?? buildRollingStream
  const report = options.onProblem ?? ((message: string) => void process.stderr.write(`${message}\n`))
  const reopenDelayMs = options.reopenDelayMs ?? REOPEN_DELAY_MS

  let state: 'opening' | 'ready' | 'broken' = 'opening'
  let stream: RollingStream | null = null
  let opened: Promise<void> = Promise.resolve()
  const pending: string[] = []

  function fail(what: string, error: unknown): void {
    if (state === 'broken') return
    state = 'broken'
    try {
      stream?.end()
    } catch {
      /* already closed */
    }
    stream = null
    pending.length = 0
    const reason = error instanceof Error ? error.message : String(error)
    report(
      `log file ${what}: ${reason}. Logging to standard output only; opening the file again in ${Math.round(reopenDelayMs / 1000)}s.`,
    )
    setTimeout(open, reopenDelayMs).unref()
  }

  function open(): void {
    state = 'opening'
    opened = build({
      file: join(options.dir, LOG_FILE_BASE),
      frequency: 'daily',
      dateFormat: 'yyyy-MM-dd',
      extension: '.log',
      mkdir: true,
    })
      .then((created) => {
        created.on('error', (error) => {
          // An old stream that fails after a newer one was opened must not break the new one.
          if (stream === created) fail('could not be written', error)
        })
        stream = created
        state = 'ready'
        for (const line of pending.splice(0)) created.write(line)
      })
      .catch((error: unknown) => fail('could not be opened', error))
  }

  open()

  return {
    write(line) {
      if (state === 'ready' && stream) stream.write(line)
      else if (state === 'opening' && pending.length < MAX_PENDING_LINES) pending.push(line)
    },
    flush() {
      try {
        stream?.flushSync()
      } catch {
        /* nothing more can be done while exiting */
      }
    },
    whenOpen: () => opened,
  }
}

export type PruneOptions = {
  dir: string
  retentionDays: number
  /** "YYYY-MM-DD" in the log time zone */
  today: string
  list?: (dir: string) => Promise<string[]>
  remove?: (path: string) => Promise<void>
}

/** Deletes the log files of days before the cutoff. Files that do not look like log files are never touched. */
export async function pruneOldLogFiles(options: PruneOptions): Promise<string[]> {
  const list = options.list ?? ((dir: string) => readdir(dir))
  const remove = options.remove ?? ((path: string) => unlink(path))
  let names: string[]
  try {
    names = await list(options.dir)
  } catch {
    return []
  }
  const cutoff = cutoffDay(options.today, options.retentionDays)
  const removed: string[] = []
  for (const name of names) {
    const match = LOG_FILE_PATTERN.exec(name)
    if (!match || (match[1] as string) >= cutoff) continue
    try {
      await remove(join(options.dir, name))
      removed.push(name)
    } catch {
      /* in use or already gone: the next run tries again */
    }
  }
  return removed
}

function retentionDaysFrom(raw: string | undefined): number {
  const n = Number(raw)
  return Number.isInteger(n) && n >= 1 && n <= 3650 ? n : DEFAULT_RETENTION_DAYS
}

declare global {
  var __fileLogging: { flush(): void } | undefined
}

/**
 * Starts writing the log lines to the daily file, once per process (a hot reload does not start a second writer).
 * Skipped when LOG_TO_FILE=0. Answers null when file logging is off.
 */
export function startFileLogging(env: NodeJS.ProcessEnv = process.env): { flush(): void } | null {
  if (globalThis.__fileLogging) return globalThis.__fileLogging
  loadDotEnvOnce()
  if (env.LOG_TO_FILE === '0') return null
  const dir = resolve(env.LOG_DIR || 'logs')
  const retentionDays = retentionDaysFrom(env.LOG_RETENTION_DAYS)
  const timeZone = currentLogTimeZone()

  const sink = createFileSink({ dir })
  setFileSink(sink)

  const prune = () => {
    void pruneOldLogFiles({ dir, retentionDays, today: logDay(new Date(), timeZone) })
  }
  prune()
  setInterval(prune, PRUNE_EVERY_MS).unref()

  globalThis.__fileLogging = { flush: () => sink.flush() }
  return globalThis.__fileLogging
}
