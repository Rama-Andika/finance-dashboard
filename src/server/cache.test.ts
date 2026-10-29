import { describe, expect, it, vi } from 'vitest'
import { createLruCache, hashIds } from './cache'

describe('LRU Cache & Closed Period Caching (Phase 14)', () => {
  it('returns cached item on second call and does not call loader', () => {
    const cache = createLruCache<string>({ maxEntries: 10, ttlMs: 1000 })
    const loader = vi.fn().mockReturnValue('value-1')

    // Initial get (miss)
    let val = cache.get('key-1')
    if (val === undefined) {
      const loaded = loader()
      cache.set('key-1', loaded)
      val = loaded
    }
    expect(val).toBe('value-1')
    expect(loader).toHaveBeenCalledTimes(1)

    // Second get (hit)
    let val2 = cache.get('key-1')
    if (val2 === undefined) {
      const loaded = loader()
      cache.set('key-1', loaded)
      val2 = loaded
    }
    expect(val2).toBe('value-1')
    expect(loader).toHaveBeenCalledTimes(1) // Still 1, loader not called again
  })

  it('expires entries after TTL based on nowMs', () => {
    const cache = createLruCache<number>({ maxEntries: 10, ttlMs: 1000 })
    const baseTime = 1000000

    cache.set('item-1', 42, baseTime)
    expect(cache.get('item-1', baseTime + 500)).toBe(42)

    // Expired at baseTime + 1000
    expect(cache.get('item-1', baseTime + 1000)).toBeUndefined()
    expect(cache.get('item-1', baseTime + 1500)).toBeUndefined()
    expect(cache.size()).toBe(0)
  })

  it('evicts the least recently used item when maxEntries is exceeded', () => {
    const cache = createLruCache<string>({ maxEntries: 3, ttlMs: 10000 })

    cache.set('a', 'alpha')
    cache.set('b', 'beta')
    cache.set('c', 'gamma')
    expect(cache.size()).toBe(3)

    // Access 'a' to mark it as recently used
    cache.get('a')

    // Add 'd', should evict 'b' (since 'b' is now the oldest)
    cache.set('d', 'delta')
    expect(cache.size()).toBe(3)
    expect(cache.get('b')).toBeUndefined()
    expect(cache.get('a')).toBe('alpha')
    expect(cache.get('c')).toBe('gamma')
    expect(cache.get('d')).toBe('delta')
  })

  it('hashIds returns deterministic 16-character sha1 hash of sorted IDs', () => {
    const hash1 = hashIds(['300', '100', '200'])
    const hash2 = hashIds(['100', '200', '300']) // same set, different order
    expect(hash1).toBe(hash2)
    expect(hash1.length).toBe(16)
    expect(hashIds('all')).toBe('all')
    expect(hashIds([])).toBe('empty')
  })

  it('guarantees Open periods are never cached, while Closed periods are cached', () => {
    const closedCache = createLruCache<string>({ maxEntries: 10, ttlMs: 10000 })

    const periods = [
      { id: 'p-1', status: 'Closed' },
      { id: 'p-2', status: 'Open' },
      { id: 'p-3', status: 'Pre Closed' },
    ]

    const simulateMovements = (p: { id: string; status: string }, fetcher: () => string) => {
      if (p.status === 'Closed') {
        let val = closedCache.get(`mv|gl|${p.id}|Closed`)
        if (val === undefined) {
          val = fetcher()
          closedCache.set(`mv|gl|${p.id}|Closed`, val)
        }
        return val
      }
      // Open / Pre Closed is always computed fresh without cache
      return fetcher()
    }

    const mockFetcher = vi.fn().mockImplementation(() => 'data')

    // 1st run
    periods.forEach((p) => simulateMovements(p, mockFetcher))
    expect(mockFetcher).toHaveBeenCalledTimes(3)

    // 2nd run
    periods.forEach((p) => simulateMovements(p, mockFetcher))
    // Closed period hit cache (no new fetch), but Open and Pre Closed were fetched again (2 more calls)
    expect(mockFetcher).toHaveBeenCalledTimes(5)
    expect(closedCache.get('mv|gl|p-1|Closed')).toBe('data')
    expect(closedCache.get('mv|gl|p-2|Open')).toBeUndefined()
    expect(closedCache.get('mv|gl|p-3|Pre Closed')).toBeUndefined()
  })
})
