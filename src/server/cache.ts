import '@tanstack/react-start/server-only'
import { createHash } from 'node:crypto'
import { createLogger, errorText } from '~/server/log'
import { timed } from '~/server/perf'

const log = createLogger('cache')

type CacheEntry<T> = {
  value: T
  expiresAt: number
}

/** Upper bounds for the memo: entry count, and total "weight" (roughly the number of cached rows). */
const MEMO_MAX_ENTRIES = 200
const MEMO_MAX_WEIGHT = 1_500_000

type MemoEntry = CacheEntry<unknown> & {
  weight: number
  /** Until when the (expired) value may still be served while a reload runs; equal to `expiresAt` without a stale window. */
  staleUntil: number
}

const memoryCache = new Map<string, MemoEntry>()
const inflight = new Map<string, Promise<unknown>>()
let memoWeight = 0
/** Bumped by `clearCache`, so a load that started before the clear never stores its (stale) result. */
let generation = 0

/** Rows held by a list, map or set; anything else holds none. */
function rowsIn(value: unknown): number {
  if (Array.isArray(value)) return value.length
  if (value instanceof Map || value instanceof Set) return value.size
  return 0
}

/**
 * A list weighs as many as it has rows. A result object weighs 1 plus the rows of its top-level lists, maps and sets:
 * a payment plan is an object holding 100k+ bills, and counting it as 1 let the memo grow far past its budget.
 */
function weightOf(value: unknown): number {
  if (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    !(value instanceof Map) &&
    !(value instanceof Set)
  ) {
    let weight = 1
    for (const field of Object.values(value)) weight += rowsIn(field)
    return weight
  }
  return rowsIn(value) + 1
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
    if (entry.staleUntil <= now) dropMemo(k)
  }
  while (memoryCache.size > 0 && (memoryCache.size >= MEMO_MAX_ENTRIES || memoWeight + incoming > MEMO_MAX_WEIGHT)) {
    const oldestKey = memoryCache.keys().next().value
    if (oldestKey === undefined) break
    dropMemo(oldestKey)
  }
}

/** A reload that failed in the background waits this long before the next attempt; the old value keeps being served. */
const BACKGROUND_RETRY_MS = 10_000

export type MemoOptions = {
  /** After `ttlMs`, the old value is still served for this many more ms while one reload runs in the background. */
  staleMs?: number
}

function storeMemo(key: string, value: unknown, ttlMs: number, staleMs: number) {
  const weight = weightOf(value)
  dropMemo(key)
  evictMemo(Date.now(), weight)
  const expiresAt = Date.now() + ttlMs
  memoryCache.set(key, { value, expiresAt, staleUntil: expiresAt + staleMs, weight })
  memoWeight += weight
}

/** Runs the loader once for `key` (concurrent callers share it) and stores the result unless `clearCache` ran meanwhile. */
function startReload<T>(
  key: string,
  ttlMs: number,
  staleMs: number,
  loader: () => Promise<T>,
  background: boolean,
): Promise<T> {
  const startedAt = generation
  const load = loader()
    .then((val) => {
      if (startedAt === generation) storeMemo(key, val, ttlMs, staleMs)
      return val
    })
    .finally(() => {
      inflight.delete(key)
    })
  inflight.set(key, load)
  if (background) {
    // Nobody waits for this load: a failure keeps the old value and delays the next attempt.
    load.catch((error: unknown) => {
      const entry = memoryCache.get(key)
      if (entry && startedAt === generation) entry.expiresAt = Date.now() + BACKGROUND_RETRY_MS
      log.warn(`background reload of ${key} failed: ${errorText(error)}`)
    })
  }
  return load
}

export async function memo<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  options: MemoOptions = {},
): Promise<T> {
  const staleMs = options.staleMs ?? 0
  const now = Date.now()
  const hit = memoryCache.get(key)
  if (hit && hit.expiresAt > now) {
    // Re-insert so the map order stays "least recently used first".
    memoryCache.delete(key)
    memoryCache.set(key, hit)
    return hit.value as T
  }

  if (hit && hit.staleUntil > now) {
    // Expired but still inside the stale window: answer now, reload once in the background.
    if (!inflight.has(key)) void startReload(key, ttlMs, staleMs, loader, true)
    memoryCache.delete(key)
    memoryCache.set(key, hit)
    return hit.value as T
  }

  // Concurrent callers for the same key share one load instead of querying twice.
  const pending = inflight.get(key)
  if (pending) return pending as Promise<T>

  return startReload(key, ttlMs, staleMs, loader, false)
}

/** Reads a whole-number setting from process.env (this module stays free of the env module on purpose). */
function secondsFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name]
  if (raw === undefined || raw === '') return fallback
  const n = Number(raw)
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback
}

/**
 * Short-lived memo for computed metrics. Several metrics (and the drill-down) need the same
 * sub-result in one request, e.g. Summary + Runway + Payment Plan all need the cash position.
 * Cleared together with every other memo entry when the account mapping changes.
 * Stale-while-revalidate: after METRIC_FRESH_SECONDS the old answer is still served for METRIC_STALE_SECONDS while it is
 * recalculated in the background. A caller that passes its own `ttlMs` gets no stale window.
 */
export function memoMetric<T>(name: string, params: unknown, loader: () => Promise<T>, ttlMs?: number): Promise<T> {
  const freshMs = ttlMs ?? secondsFromEnv('METRIC_FRESH_SECONDS', 60, 5, 3600) * 1000
  const staleMs = ttlMs === undefined ? secondsFromEnv('METRIC_STALE_SECONDS', 180, 0, 86_400) * 1000 : 0
  const digest = createHash('sha1').update(JSON.stringify(params)).digest('hex')
  // Only a real computation is timed: a cache hit never calls the loader. Nested metrics overlap in time.
  return memo(`metric:${name}:${digest}`, freshMs, () => timed(`metric ${name}`, loader), { staleMs })
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
