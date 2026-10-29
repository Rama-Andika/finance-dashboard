import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

/** Upper bounds for the memo: entry count, and total "weight" (roughly the number of cached rows). */
const MEMO_MAX_ENTRIES = 200
const MEMO_MAX_WEIGHT = 1_500_000

type MemoEntry = CacheEntry<unknown> & { weight: number }

const memoryCache = new Map<string, MemoEntry>()
const inflight = new Map<string, Promise<unknown>>()
let memoWeight = 0
/** Bumped by `clearCache`, so a load that started before the clear never stores its (stale) result. */
let generation = 0

/** Arrays weigh as many as they have rows; everything else weighs 1. */
function weightOf(value: unknown): number {
  return Array.isArray(value) ? value.length + 1 : 1
}

function dropMemo(key: string) {
  const entry = memoryCache.get(key)
  if (!entry) return
  memoWeight -= entry.weight
  memoryCache.delete(key)
}

/** Drops expired entries, then the least recently used ones until a new entry of `incoming` weight fits. */
function evictMemo(now: number, incoming: number) {
  for (const [k, entry] of memoryCache) {
    if (entry.expiresAt <= now) dropMemo(k)
  }
  while (memoryCache.size > 0 && (memoryCache.size >= MEMO_MAX_ENTRIES || memoWeight + incoming > MEMO_MAX_WEIGHT)) {
    const oldestKey = memoryCache.keys().next().value
    if (oldestKey === undefined) break
    dropMemo(oldestKey)
  }
}

export async function memo<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now()
  const hit = memoryCache.get(key)
  if (hit && hit.expiresAt > now) {
    // Re-insert so the map order stays "least recently used first".
    memoryCache.delete(key)
    memoryCache.set(key, hit)
    return hit.value as T
  }

  // Concurrent callers for the same key share one load instead of querying twice.
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const startedAt = generation
  const load = loader()
    .then((val) => {
      if (startedAt !== generation) return val
      const weight = weightOf(val)
      dropMemo(key)
      evictMemo(Date.now(), weight)
      memoryCache.set(key, { value: val, expiresAt: Date.now() + ttlMs, weight })
      memoWeight += weight
      return val
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, load)
  return load
}

const METRIC_TTL_MS = 60 * 1000

/**
 * Short-lived memo for computed metrics. Several metrics (and the drill-down) need the same
 * sub-result in one request, e.g. Summary + Runway + Payment Plan all need the cash position.
 * Cleared together with every other memo entry when the account mapping changes.
 */
export function memoMetric<T>(
  name: string,
  params: unknown,
  loader: () => Promise<T>,
  ttlMs: number = METRIC_TTL_MS,
): Promise<T> {
  const digest = createHash('sha1').update(JSON.stringify(params)).digest('hex')
  return memo(`metric:${name}:${digest}`, ttlMs, loader)
}

/** Number of memo entries (for tests). */
export function memoSize(): number {
  return memoryCache.size
}

export type LruCache<V> = {
  get(key: string, nowMs?: number): V | undefined
  set(key: string, value: V, nowMs?: number): void
  clear(): void
  size(): number
}

/**
 * LRU cache with a TTL. `maxEntries` bounds the entry count; the optional `weigh` +
 * `maxWeight` pair bounds the total size (e.g. number of cached rows).
 */
export function createLruCache<V>(opts: {
  maxEntries: number
  ttlMs: number
  weigh?: (value: V) => number
  maxWeight?: number
}): LruCache<V> {
  const map = new Map<string, { value: V; expiresAt: number; weight: number }>()
  let totalWeight = 0
  const weighOf = (value: V) => (opts.weigh ? opts.weigh(value) : 0)

  const drop = (key: string) => {
    const entry = map.get(key)
    if (!entry) return
    totalWeight -= entry.weight
    map.delete(key)
  }

  return {
    get(key: string, nowMs?: number): V | undefined {
      const now = nowMs ?? Date.now()
      const entry = map.get(key)
      if (!entry) return undefined

      if (entry.expiresAt <= now) {
        drop(key)
        return undefined
      }

      // Re-insert to mark as recently used (LRU property of Map iteration)
      map.delete(key)
      map.set(key, entry)
      return entry.value
    },

    set(key: string, value: V, nowMs?: number): void {
      const now = nowMs ?? Date.now()
      drop(key)
      while (map.size >= opts.maxEntries) {
        const oldestKey = map.keys().next().value
        if (oldestKey === undefined) break
        drop(oldestKey)
      }

      const weight = weighOf(value)
      if (opts.maxWeight !== undefined) {
        while (map.size > 0 && totalWeight + weight > opts.maxWeight) {
          const oldestKey = map.keys().next().value
          if (oldestKey === undefined) break
          drop(oldestKey)
        }
      }

      map.set(key, { value, expiresAt: now + opts.ttlMs, weight })
      totalWeight += weight
    },

    clear(): void {
      map.clear()
      totalWeight = 0
    },

    size(): number {
      return map.size
    },
  }
}

export function hashIds(ids: readonly string[] | 'all' | undefined): string {
  if (!ids || ids === 'all') return 'all'
  if (ids.length === 0) return 'empty'
  const sorted = [...ids].sort()
  return createHash('sha1').update(sorted.join(',')).digest('hex').slice(0, 16)
}

/** One aggregated GL movement row, as cached per closed period. */
export type CachedMovementRow = {
  coaId: string
  periodId?: string
  locationId?: string
  debet: string
  credit: string
}

// Closed-period GL movements: at most 500 entries and ~400k rows in total, 6 hours TTL.
export const glMovementsCache = createLruCache<readonly CachedMovementRow[]>({
  maxEntries: 500,
  ttlMs: 6 * 60 * 60 * 1000,
  weigh: (rows) => rows.length + 1,
  maxWeight: 400_000,
})

export function clearCache(keyPrefix?: string) {
  generation += 1
  if (!keyPrefix) {
    memoryCache.clear()
    memoWeight = 0
    glMovementsCache.clear()
    return
  }
  for (const k of Array.from(memoryCache.keys())) {
    if (k.startsWith(keyPrefix)) dropMemo(k)
  }
  if (
    keyPrefix.startsWith('baskets:') ||
    keyPrefix.startsWith('mv|') ||
    keyPrefix.startsWith('gl:') ||
    keyPrefix === 'all'
  ) {
    glMovementsCache.clear()
  }
}
