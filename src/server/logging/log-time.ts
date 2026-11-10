/**
 * Wall-clock time in the log time zone. Log lines and request ids carry the same clock, so an id and the "time" of its
 * lines always agree. No server-only marker: scripts, tests and the logger all load this file.
 */
import { loadDotEnvOnce } from './load-env'

/** The time zone the logs are written in: APP_TIMEZONE when it is a valid zone name, otherwise the zone of the server. */
export function resolveLogTimeZone(configured: string | undefined): string {
  if (configured) {
    try {
      new Intl.DateTimeFormat('en-US', { timeZone: configured })
      return configured
    } catch {
      /* not a valid zone name: use the zone of the server */
    }
  }
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

let cachedTimeZone: string | undefined

/** The log time zone of this process (APP_TIMEZONE, else the zone of the server), worked out once. */
export function currentLogTimeZone(): string {
  loadDotEnvOnce()
  cachedTimeZone ??= resolveLogTimeZone(process.env.APP_TIMEZONE)
  return cachedTimeZone
}

/** For tests: forget the zone so the next call reads APP_TIMEZONE again. */
export function resetLogTimeZoneForTests(): void {
  cachedTimeZone = undefined
}

export type ZonedParts = {
  year: string
  month: string
  day: string
  hour: string
  minute: string
  second: string
  /** Three digits */
  millisecond: string
  /** "+08:00" or "-05:00"; "+00:00" for UTC */
  offset: string
}

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone)
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3,
      timeZoneName: 'longOffset',
    })
    formatters.set(timeZone, formatter)
  }
  return formatter
}

/** The calendar and clock parts of `date` in `timeZone`. */
export function zonedParts(date: Date, timeZone: string): ZonedParts {
  const parts: Record<string, string> = {}
  for (const part of formatterFor(timeZone).formatToParts(date)) parts[part.type] = part.value
  // longOffset gives "GMT+08:00", or just "GMT" for UTC
  const rawOffset = parts.timeZoneName ?? 'GMT'
  const offset = rawOffset === 'GMT' ? '+00:00' : rawOffset.replace('GMT', '')
  return {
    year: parts.year ?? '0000',
    month: parts.month ?? '00',
    day: parts.day ?? '00',
    hour: parts.hour ?? '00',
    minute: parts.minute ?? '00',
    second: parts.second ?? '00',
    millisecond: parts.fractionalSecond ?? '000',
    offset,
  }
}

/** "2026-11-10T22:35:51.093+08:00" */
export function formatLogTime(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:${p.second}.${p.millisecond}${p.offset}`
}

/** "2026-11-10", the calendar day of `date` in `timeZone`. */
export function logDay(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}-${p.month}-${p.day}`
}
