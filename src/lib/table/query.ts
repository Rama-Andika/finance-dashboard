import Decimal from 'decimal.js'
import { z } from 'zod'

export const PAGE_SIZES = [25, 50, 100] as const
export const DEFAULT_PAGE_SIZE = 25
export type SortDir = 'asc' | 'desc'

export type TableQuery = {
  /** 1-based */
  page: number
  pageSize: number
  sortBy?: string
  sortDir: SortDir
}

export type Page<T> = {
  rows: T[]
  /** Rows in the whole result, not only this page */
  total: number
  page: number
  pageSize: number
}

/** URL / server-function input for one paged table. `sortBy` must be one of the table's own sort keys. */
export function tableQuerySchema<K extends readonly [string, ...string[]]>(sortKeys: K) {
  return z.object({
    page: z.coerce.number().int().min(1).max(100000).catch(1),
    pageSize: z.coerce
      .number()
      .refine((n) => (PAGE_SIZES as readonly number[]).includes(n))
      .catch(DEFAULT_PAGE_SIZE),
    sortBy: z.enum(sortKeys).optional().catch(undefined),
    sortDir: z.enum(['asc', 'desc']).catch('asc'),
  })
}

/** Same fields for the URL: all optional, so links and redirects need not carry table state. */
export function tableSearchSchema<K extends readonly [string, ...string[]]>(sortKeys: K) {
  const q = tableQuerySchema(sortKeys).shape
  return z.object({
    page: q.page.optional().catch(undefined),
    pageSize: q.pageSize.optional().catch(undefined),
    sortBy: q.sortBy,
    sortDir: q.sortDir.optional().catch(undefined),
  })
}

export type Comparator<T> = (a: T, b: T) => number

// One collator for every comparison: `localeCompare(b, locale, options)` builds a new one on each call,
// which made sorting ~150k rows by text take seconds instead of a fraction of one.
const textCollator = new Intl.Collator(undefined, { sensitivity: 'base' })

export const compareText = (a: string, b: string): number => textCollator.compare(a, b)

/** ISO dates ("2026-10-31") sort correctly as plain text, so they need no collator. */
export const compareIsoDate = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

const CHAR_MINUS = 45
const CHAR_ZERO = 48

/** Where the digits of a plain decimal string sit: after an optional minus, up to the decimal point (if any). */
type DecimalLayout = { negative: boolean; start: number; dot: number; intLength: number; fractionLength: number }

/** The layout of a plain decimal ("-1234.50"), or null when the text has another shape (empty, exponent, leading zeros). */
function layoutOf(text: string): DecimalLayout | null {
  const negative = text.charCodeAt(0) === CHAR_MINUS
  const start = negative ? 1 : 0
  const dot = text.indexOf('.', start)
  const intLength = (dot < 0 ? text.length : dot) - start
  if (intLength === 0) return null
  if (intLength > 1 && text.charCodeAt(start) === CHAR_ZERO) return null
  if (!hasOnlyDigits(text, start, dot)) return null
  return { negative, start, dot, intLength, fractionLength: dot < 0 ? 0 : text.length - dot - 1 }
}

/** Compares the whole-number digits: more digits is bigger, then digit by digit. */
function compareIntegerDigits(a: string, x: DecimalLayout, b: string, y: DecimalLayout): number {
  if (x.intLength !== y.intLength) return x.intLength < y.intLength ? -1 : 1
  for (let i = 0; i < x.intLength; i += 1) {
    const diff = a.charCodeAt(x.start + i) - b.charCodeAt(y.start + i)
    if (diff !== 0) return diff < 0 ? -1 : 1
  }
  return 0
}

/** Compares the digits after the decimal point; a missing digit counts as zero. */
function compareFractionDigits(a: string, x: DecimalLayout, b: string, y: DecimalLayout): number {
  const length = Math.max(x.fractionLength, y.fractionLength)
  for (let i = 0; i < length; i += 1) {
    const ca = i < x.fractionLength ? a.charCodeAt(x.dot + 1 + i) : CHAR_ZERO
    const cb = i < y.fractionLength ? b.charCodeAt(y.dot + 1 + i) : CHAR_ZERO
    if (ca !== cb) return ca < cb ? -1 : 1
  }
  return 0
}

/**
 * Exact comparison of two plain decimal strings ("-1234.50", "0", "7") without allocating digit strings.
 * Returns null when a string has another shape, so the caller can fall back to Decimal.
 */
function comparePlainDecimals(a: string, b: string): number | null {
  const x = layoutOf(a)
  const y = layoutOf(b)
  if (!x || !y) return null

  const magnitude = compareIntegerDigits(a, x, b, y) || compareFractionDigits(a, x, b, y)
  if (magnitude !== 0) {
    if (x.negative === y.negative) return x.negative ? -magnitude : magnitude
    return x.negative ? -1 : 1
  }
  // Same absolute value: equal, unless the signs differ and the value is not zero.
  if (x.negative === y.negative) return 0
  return isZeroValue(a, x.start, x.intLength, x.dot) ? 0 : x.negative ? -1 : 1
}

/** True when everything after `start` is a digit, except the one decimal point at `dot` (-1 = none). */
function hasOnlyDigits(text: string, start: number, dot: number): boolean {
  for (let i = start; i < text.length; i += 1) {
    if (i === dot) continue
    const code = text.charCodeAt(i)
    if (code < CHAR_ZERO || code > CHAR_ZERO + 9) return false
  }
  return true
}

function isZeroValue(text: string, start: number, intLength: number, dot: number): boolean {
  if (intLength !== 1 || text.charCodeAt(start) !== CHAR_ZERO) return false
  if (dot < 0) return true
  for (let i = dot + 1; i < text.length; i += 1) {
    if (text.charCodeAt(i) !== CHAR_ZERO) return false
  }
  return true
}

/** Money strings are compared as decimals, never as floating point. */
export function compareMoney(a: string, b: string): number {
  const fast = comparePlainDecimals(a, b)
  if (fast !== null) return fast
  return new Decimal(a || 0).cmp(new Decimal(b || 0))
}

/** A stable sorted copy of `rows`. Rows that compare equal keep their original order in both directions. */
export function sortRows<T>(rows: readonly T[], compare: Comparator<T>, dir: SortDir): T[] {
  const sign = dir === 'desc' ? -1 : 1
  return [...rows].sort((a, b) => sign * compare(a, b))
}

/** The requested page of an already sorted result; a page past the end is clamped to the last one. */
export function pageOfSorted<T>(sorted: readonly T[], query: TableQuery): Page<T> {
  const pageSize = Math.max(1, query.pageSize)
  const lastPage = Math.max(1, Math.ceil(sorted.length / pageSize))
  const page = Math.min(Math.max(1, query.page), lastPage)
  const start = (page - 1) * pageSize

  return {
    rows: sorted.slice(start, start + pageSize),
    total: sorted.length,
    page,
    pageSize,
  }
}

/**
 * Sorts (stable) and slices an in-memory result. `comparators` is the whitelist of sortable keys:
 * a `sortBy` that is not in it is ignored, so user input never decides what is executed.
 */
export function paginate<T>(
  rows: readonly T[],
  query: TableQuery,
  comparators: Record<string, Comparator<T>>,
): Page<T> {
  const compare = query.sortBy ? comparators[query.sortBy] : undefined
  return pageOfSorted(compare ? sortRows(rows, compare, query.sortDir) : rows, query)
}

/**
 * Remembers derived views of a long-lived list (a sorted or filtered copy) for as long as that list is alive:
 * the list is the key, so a view disappears together with the cached result it was built from.
 */
export function createViewCache<T, V = readonly T[]>() {
  const views = new WeakMap<readonly T[], Map<string, V>>()
  return function view(source: readonly T[], viewKey: string, build: () => V): V {
    let byKey = views.get(source)
    if (!byKey) {
      byKey = new Map()
      views.set(source, byKey)
    }
    const hit = byKey.get(viewKey)
    if (hit !== undefined) return hit
    const created = build()
    byKey.set(viewKey, created)
    return created
  }
}
