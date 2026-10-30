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

export const compareText = (a: string, b: string): number => a.localeCompare(b, undefined, { sensitivity: 'base' })
/** Money strings are compared as decimals, never as floating point. */
export const compareMoney = (a: string, b: string): number => new Decimal(a || 0).cmp(new Decimal(b || 0))

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
  const indexed = rows.map((row, index) => ({ row, index }))
  if (compare) {
    const sign = query.sortDir === 'desc' ? -1 : 1
    indexed.sort((a, b) => sign * compare(a.row, b.row) || a.index - b.index)
  }

  const pageSize = Math.max(1, query.pageSize)
  const lastPage = Math.max(1, Math.ceil(indexed.length / pageSize))
  const page = Math.min(Math.max(1, query.page), lastPage)
  const start = (page - 1) * pageSize

  return {
    rows: indexed.slice(start, start + pageSize).map((x) => x.row),
    total: indexed.length,
    page,
    pageSize,
  }
}
