/**
 * Names and days of the daily log files ("app.2026-11-10.1.log"). Pure and free of pino, so the log search script can
 * load it without starting a logger. No server-only marker: scripts and tests load this file.
 */
export const LOG_FILE_BASE = 'app'

/** "app.2026-11-10.1.log": the day, then the rotation number. */
export const LOG_FILE_PATTERN = /^app\.(\d{4}-\d{2}-\d{2})\.(\d+)\.log$/

export type LogFileName = { name: string; day: string; number: number }

/** Reads a file name; null for anything that is not a log file of ours. */
export function parseLogFileName(name: string): LogFileName | null {
  const match = LOG_FILE_PATTERN.exec(name)
  if (!match) return null
  return { name, day: match[1] as string, number: Number(match[2]) }
}

/** "2026-11-10" plus `days` (negative goes back). */
export function addDays(day: string, days: number): string {
  return new Date(Date.parse(`${day}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10)
}

/** The first day that is still kept: `retentionDays` before `today`. Both are "YYYY-MM-DD". */
export function cutoffDay(today: string, retentionDays: number): string {
  return addDays(today, -retentionDays)
}

/** The log files whose day lies between `from` and `to` (both included), oldest first. */
export function logFilesInRange(names: readonly string[], from: string, to: string): LogFileName[] {
  const files: LogFileName[] = []
  for (const name of names) {
    const file = parseLogFileName(name)
    if (file && file.day >= from && file.day <= to) files.push(file)
  }
  return files.sort((a, b) => (a.day === b.day ? a.number - b.number : a.day < b.day ? -1 : 1))
}
