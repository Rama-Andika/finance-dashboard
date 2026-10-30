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
