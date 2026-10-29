/** MySQL `IN (...)` lists are sent in slices of this size. */
export const IN_LIST_LIMIT = 1000

/** Split a list into slices of at most `size` items. */
export function chunk<T>(items: readonly T[], size: number = IN_LIST_LIMIT): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Slices for an optional filter: `'all'` / `undefined` → a single `undefined` slice (no filter),
 * otherwise the sliced ids. An empty id list yields no slices (the caller has nothing to query).
 */
export function chunkOrAll<T>(ids: readonly T[] | 'all' | undefined, size: number = IN_LIST_LIMIT): (T[] | undefined)[] {
  if (ids === undefined || ids === 'all') return [undefined]
  return chunk(ids, size)
}
