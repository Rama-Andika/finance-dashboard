import { zonedParts } from './log-time'

/** 31 characters without the look-alikes i, l, o, 0 and 1, so an id read from a screen or a screenshot is typed correctly. */
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/** Matches a request id ("20261110-143551-k7q2m") and a job id ("job-20261110-143551-k7q2m"). */
export const LOG_ID_PATTERN = /^(job-)?\d{8}-\d{6}-[a-hjkmnp-z2-9]{5}$/

export function isLogId(value: string): boolean {
  return LOG_ID_PATTERN.test(value)
}

/** Five random characters. Not a secret: the id only has to differ from the ids made in the same second. */
function randomSuffix(): string {
  const bytes = new Uint8Array(5)
  crypto.getRandomValues(bytes)
  let out = ''
  for (const byte of bytes) out += ALPHABET[byte % ALPHABET.length]
  return out
}

function stamp(date: Date, timeZone: string): string {
  const p = zonedParts(date, timeZone)
  return `${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}`
}

/** "20261110-143551-k7q2m": the time of the request in the log time zone, then five random characters. */
export function createRequestId(date: Date, timeZone: string): string {
  return `${stamp(date, timeZone)}-${randomSuffix()}`
}

/** "job-20261110-143551-k7q2m": same shape, for a background job. */
export function createJobId(date: Date, timeZone: string): string {
  return `job-${createRequestId(date, timeZone)}`
}

/** The calendar day ("2026-11-10") written in an id, or null when the text is not an id. */
export function dayOfLogId(id: string): string | null {
  const match = /^(?:job-)?(\d{4})(\d{2})(\d{2})-\d{6}-/.exec(id)
  return match ? `${match[1]}-${match[2]}-${match[3]}` : null
}
