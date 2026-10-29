import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

/** Upper bound for memo entries; the oldest entry is evicted first. */
const MEMO_MAX_ENTRIES = 200

const memoryCache = new Map<string, CacheEntry<unknown>>()
const inflight = new Map<string, Promise<unknown>>()

function evictMemo(now: number) {
  for (const [k, entry] of memoryCache) {
    if (entry.expiresAt <= now) memoryCache.delete(k)
  }
  while (memoryCache.size >= MEMO_MAX_ENTRIES) {
    const oldestKey = memoryCache.keys().next().value
    if (oldestKey === undefined) break
    memoryCache.delete(oldestKey)
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
    return hit.value as T
  }

  // Concurrent callers for the same key share one load instead of querying twice.
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  const load = loader()
    .then((val) => {
      evictMemo(Date.now())
      memoryCache.set(key, { value: val, expiresAt: Date.now() + ttlMs })
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
  if (!keyPrefix) {
    memoryCache.clear()
    glMovementsCache.clear()
    return
  }
  for (const k of memoryCache.keys()) {
    if (k.startsWith(keyPrefix)) {
      memoryCache.delete(k)
    }
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
