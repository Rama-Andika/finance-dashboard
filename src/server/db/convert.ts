import '@tanstack/react-start/server-only'

/**
 * A whole number read from a database column (the driver returns numbers or numeric strings).
 * A missing value (null, undefined, empty) gives `fallback`, which should mirror the column default;
 * a value that is not a whole number throws instead of turning into 0, so damaged data is not hidden.
 */
export function toInt(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === '') return fallback
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(n)) throw new Error(`toInt: not a whole number: ${String(value)}`)
  return n
}
