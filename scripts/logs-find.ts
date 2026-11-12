import { createReadStream } from 'node:fs'
import { readdir } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { createInterface } from 'node:readline'
import { parseArgs } from 'node:util'
import { logFilesInRange } from '~/server/logging/log-file-name'
import {
  candidateDays,
  formatEntry,
  LEVEL_RANK,
  matchesFilters,
  parseLogLine,
  parseTimeBoundary,
  type LogEntry,
  type SearchFilters,
} from '~/server/logging/log-search'
import { currentLogTimeZone, logDay } from '~/server/logging/log-time'
import { isLogId } from '~/server/logging/request-id'

const USAGE = `Find lines in the log files of this server.

  npm run logs:find -- <request-id>
  npm run logs:find -- --level error --since 14:00 --until 14:30
  npm run logs:find -- --user 17 --path /summary

An id is a request id (20261110-143551-k7q2m) or a job id (job-20261110-144500-p2d1x). A request id also finds the
job that was started by that request (the "Refresh now" button).

Options
  --level <level>   lowest level to show: trace, debug, info, warn, error, fatal
  --since <time>    from this time: 14:30 (today), "2026-11-10 14:30" or 2026-11-10
  --until <time>    up to this time, same forms
  --user <id>       lines of this signed-in user (the sysuser id)
  --path <text>     request lines whose path starts with this text
  --days <n>        without --since: how many days back to search (default 1: yesterday and today)
  --limit <n>       stop after this many lines (default 500)
  --dir <folder>    log folder (default: LOG_DIR, else ./logs)
  --raw             print the JSON lines as they are written
  -h, --help        this text

Without an id and without any filter, the warnings and errors of the last days are shown.
Times are the wall-clock times written in the log (APP_TIMEZONE).`

type Options = {
  level?: string
  since?: string
  until?: string
  user?: string
  path?: string
  days?: string
  limit?: string
  dir?: string
  raw?: boolean
  help?: boolean
}

function fail(message: string): number {
  console.error(`${message}\n\nRun "npm run logs:find -- --help" for the options.`)
  return 1
}

/** A whole number of at least 1, or null. */
function positiveInt(text: string | undefined, fallback: number): number | null {
  if (text === undefined) return fallback
  const n = Number(text)
  return Number.isInteger(n) && n >= 1 ? n : null
}

async function main(): Promise<number> {
  let values: Options
  let positionals: string[]
  try {
    const parsed = parseArgs({
      allowPositionals: true,
      options: {
        level: { type: 'string' },
        since: { type: 'string' },
        until: { type: 'string' },
        user: { type: 'string' },
        path: { type: 'string' },
        days: { type: 'string' },
        limit: { type: 'string' },
        dir: { type: 'string' },
        raw: { type: 'boolean' },
        help: { type: 'boolean', short: 'h' },
      },
    })
    values = parsed.values
    positionals = parsed.positionals
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error))
  }
  if (values.help) {
    console.log(USAGE)
    return 0
  }

  const id = positionals[0]
  if (positionals.length > 1) return fail('Give one id at most.')
  if (id !== undefined && !isLogId(id)) {
    return fail(`"${id}" is not a request id or a job id. An id looks like 20261110-143551-k7q2m.`)
  }

  const today = logDay(new Date(), currentLogTimeZone())
  const since = values.since === undefined ? undefined : parseTimeBoundary(values.since, today)
  const until = values.until === undefined ? undefined : parseTimeBoundary(values.until, today)
  if (since === null)
    return fail(`--since "${values.since}" is not a time. Use 14:30, "2026-11-10 14:30" or 2026-11-10.`)
  if (until === null)
    return fail(`--until "${values.until}" is not a time. Use 14:30, "2026-11-10 14:30" or 2026-11-10.`)
  if (values.level !== undefined && !Object.hasOwn(LEVEL_RANK, values.level)) {
    return fail(`--level "${values.level}" is not a level. Use trace, debug, info, warn, error or fatal.`)
  }
  const days = positiveInt(values.days, 1)
  const limit = positiveInt(values.limit, 500)
  if (days === null) return fail('--days must be a whole number of at least 1.')
  if (limit === null) return fail('--limit must be a whole number of at least 1.')

  const filters: SearchFilters = {}
  if (id) filters.id = id
  if (values.level) filters.minLevel = values.level
  if (since) filters.since = since
  if (until) filters.until = until
  if (values.user) filters.userId = values.user
  if (values.path) filters.path = values.path
  if (Object.keys(filters).length === 0) filters.minLevel = 'warn'

  const dir = resolve(values.dir ?? (process.env.LOG_DIR || 'logs'))
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return fail(`The log folder "${dir}" cannot be read. Pass --dir, or set LOG_DIR.`)
  }

  const range = candidateDays({ id, since: filters.since, until: filters.until, days, today })
  const files = logFilesInRange(names, range.from, range.to)
  if (files.length === 0) {
    console.log(`No log files for ${range.from} to ${range.to} in ${dir}.`)
    return 0
  }

  const found: LogEntry[] = []
  const rawLines: string[] = []
  let reachedLimit = false
  for (const file of files) {
    const reader = createInterface({ input: createReadStream(join(dir, file.name)), crlfDelay: Infinity })
    for await (const line of reader) {
      const entry = parseLogLine(line)
      if (!entry || !matchesFilters(entry, filters)) continue
      found.push(entry)
      rawLines.push(line)
      if (found.length >= limit) {
        reachedLimit = true
        reader.close()
        break
      }
    }
    if (reachedLimit) break
  }

  if (found.length === 0) {
    console.log(`Nothing found in ${files.length} file(s) of ${dir} (days ${range.from} to ${range.to}).`)
    if (id) console.log('The id may come from another server, or its file was removed after the retention time.')
    return 0
  }

  if (values.raw) {
    console.log(rawLines.join('\n'))
    return 0
  }
  const output: string[] = []
  for (const entry of found) output.push(...formatEntry(entry, { showIds: id === undefined }))
  console.log(output.join('\n'))
  const errorRank = LEVEL_RANK.error ?? 50
  const errors = found.filter((entry) => (LEVEL_RANK[entry.level] ?? 0) >= errorRank).length
  console.log(`\n${found.length} line(s), ${errors} error(s); searched ${files.length} file(s).`)
  if (reachedLimit) console.log(`Stopped at the limit of ${limit} lines. Narrow the search, or raise --limit.`)
  return 0
}

main()
  .then((code) => process.exit(code))
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exit(1)
  })
