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

export function createLruCache<V>(opts: { maxEntries: number; ttlMs: number }): LruCache<V> {
  const map = new Map<string, { value: V; expiresAt: number }>()

  return {
    get(key: string, nowMs?: number): V | undefined {
      const now = nowMs ?? Date.now()
      const entry = map.get(key)
      if (!entry) return undefined

      if (entry.expiresAt <= now) {
        map.delete(key)
        return undefined
      }

      // Re-insert to mark as recently used (LRU property of Map iteration)
      map.delete(key)
      map.set(key, entry)
      return entry.value
    },

    set(key: string, value: V, nowMs?: number): void {
      const now = nowMs ?? Date.now()
      if (map.has(key)) {
        map.delete(key)
      } else if (map.size >= opts.maxEntries) {
        // Evict oldest item (first key)
        const oldestKey = map.keys().next().value
        if (oldestKey !== undefined) {
          map.delete(oldestKey)
        }
      }

      map.set(key, { value, expiresAt: now + opts.ttlMs })
    },

    clear(): void {
      map.clear()
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

// Global LRU cache for closed-period GL movements (max 500 entries, 6 hours TTL)
export const glMovementsCache = createLruCache<any[]>({
  maxEntries: 500,
  ttlMs: 6 * 60 * 60 * 1000,
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
