/** MySQL `IN (...)` lists are sent in slices of this size. */
export const IN_LIST_LIMIT = 1000

/** Split a list into slices of at most `size` items. */
export function chunk<T>(items: readonly T[], size: number = IN_LIST_LIMIT): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}

/**
 * Every combination of one slice from each list, so a query over two or three id lists needs a single loop
 * instead of nested ones. No combinations at all when any list has no slices (nothing to query).
 */
export function sliceCombos<A, B>(a: readonly A[], b: readonly B[]): Array<[A, B]>
export function sliceCombos<A, B, C>(a: readonly A[], b: readonly B[], c: readonly C[]): Array<[A, B, C]>
export function sliceCombos(...lists: ReadonlyArray<readonly unknown[]>): unknown[][] {
  return lists.reduce<unknown[][]>((combos, list) => combos.flatMap((combo) => list.map((item) => [...combo, item])), [[]])
}

/**
 * Slices for an optional filter: `'all'` / `undefined` → a single `undefined` slice (no filter),
 * otherwise the sliced ids. An empty id list yields no slices (the caller has nothing to query).
 */
export function chunkOrAll<T>(ids: readonly T[] | 'all' | undefined, size: number = IN_LIST_LIMIT): (T[] | undefined)[] {
  if (ids === undefined || ids === 'all') return [undefined]
  return chunk(ids, size)
}

/** How many slices of one logical query run at the same time: the connection pool is small and shared by every request. */
export const SLICE_CONCURRENCY = 3

/**
 * Runs `fn` on every item with at most `limit` running at once. The results keep the order of the items,
 * so a result built from several slices does not depend on which slice finishes first.
 */
export async function mapLimit<T, R>(
  items: readonly T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let next = 0
  const worker = async (): Promise<void> => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index] as T, index)
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(limit, 1), items.length) }, worker))
  return results
}
