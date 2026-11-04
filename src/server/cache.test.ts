import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearCache, createLruCache, hashIds, memo, memoMetric, memoSize } from './cache'

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

describe('memo', () => {
  it('shares one in-flight load between concurrent callers', async () => {
    clearCache()
    const loader = vi.fn(async () => 'v')
    const [a, b] = await Promise.all([memo('k-shared', 1000, loader), memo('k-shared', 1000, loader)])
    expect(a).toBe('v')
    expect(b).toBe('v')
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('never keeps more than 200 entries', async () => {
    clearCache()
    for (let i = 0; i < 250; i++) {
      await memo(`k-${i}`, 60_000, async () => i)
    }
    expect(memoSize()).toBeLessThanOrEqual(200)
  })
})

describe('LRU cache size bound', () => {
  it('evicts the oldest entries when the total weight exceeds maxWeight', () => {
    const cache = createLruCache<number[]>({
      maxEntries: 10,
      ttlMs: 10_000,
      weigh: (v) => v.length,
      maxWeight: 5,
    })
    cache.set('a', [1, 2, 3])
    cache.set('b', [1, 2])
    expect(cache.size()).toBe(2)
    cache.set('c', [1, 2, 3])
    // 'a' (oldest) goes first; 'b' + 'c' fit exactly in maxWeight
    expect(cache.get('a')).toBeUndefined()
    expect(cache.get('b')).toEqual([1, 2])
    expect(cache.get('c')).toEqual([1, 2, 3])
  })
})

describe('memo bounds', () => {
  it('evicts the least recently USED entry, not the oldest inserted one', async () => {
    clearCache()
    for (let i = 0; i < 199; i += 1) await memo(`k${i}`, 60_000, async () => i)
    await memo('hot', 60_000, async () => 'hot') // 200 entries
    await memo('k0', 60_000, async () => 'never-called') // touch k0: it becomes the most recent
    await memo('new', 60_000, async () => 'new') // over the limit → evicts k1 (least recently used)
    const loader = vi.fn(async () => 'reloaded')
    expect(await memo('k0', 60_000, loader)).toBe(0)
    expect(loader).not.toHaveBeenCalled()
    expect(await memo('k1', 60_000, loader)).toBe('reloaded')
  })

  it('bounds the total number of cached rows, not just the number of entries', async () => {
    clearCache()
    const big = (n: number) => Array.from({ length: n }, (_, i) => i)
    await memo('big1', 60_000, async () => big(900_000))
    await memo('big2', 60_000, async () => big(900_000)) // together above the row limit
    const loader = vi.fn(async () => big(1))
    await memo('big1', 60_000, loader)
    expect(loader).toHaveBeenCalledTimes(1) // big1 was evicted to make room for big2
  })

  it('weighs a result object by the rows of its lists, so a plan holding many bills counts as many', async () => {
    clearCache()
    const plan = (n: number) => ({ summary: 'x', bills: Array.from({ length: n }, (_, i) => i), days: [1, 2, 3] })
    await memo('plan1', 60_000, async () => plan(900_000))
    await memo('plan2', 60_000, async () => plan(900_000)) // together above the row limit
    const loader = vi.fn(async () => plan(1))
    await memo('plan1', 60_000, loader)
    expect(loader).toHaveBeenCalledTimes(1) // plan1 was evicted to make room for plan2
  })

  it('counts the entries of maps and sets inside a result too', async () => {
    clearCache()
    const withMap = (n: number) => ({ names: new Map(Array.from({ length: n }, (_, i) => [i, i] as const)) })
    await memo('m1', 60_000, async () => withMap(900_000))
    await memo('m2', 60_000, async () => withMap(900_000))
    const loader = vi.fn(async () => withMap(1))
    await memo('m1', 60_000, loader)
    expect(loader).toHaveBeenCalledTimes(1)
  })

  it('does not store a result that was loaded before clearCache()', async () => {
    clearCache()
    let release!: () => void
    const gate = new Promise<void>((resolve) => (release = resolve))
    const slow = memo('stale', 60_000, async () => {
      await gate
      return 'old'
    })
    clearCache() // e.g. the account mapping was saved while the load was running
    release()
    expect(await slow).toBe('old')
    const fresh = vi.fn(async () => 'new')
    expect(await memo('stale', 60_000, fresh)).toBe('new')
  })
})

describe('memo stale-while-revalidate', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    clearCache()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  const options = { staleMs: 5000 }

  it('serves the expired value at once and reloads once in the background', async () => {
    const loader = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')
    expect(await memo('swr-a', 1000, loader, options)).toBe('v1')
    vi.setSystemTime(Date.now() + 1500) // expired, inside the stale window
    expect(await memo('swr-a', 1000, loader, options)).toBe('v1')
    await vi.advanceTimersByTimeAsync(0) // let the background load finish
    expect(loader).toHaveBeenCalledTimes(2)
    expect(await memo('swr-a', 1000, loader, options)).toBe('v2')
    expect(loader).toHaveBeenCalledTimes(2)
  })

  it('shares one background reload between concurrent callers', async () => {
    let release: (v: string) => void = () => {}
    const loader = vi
      .fn()
      .mockResolvedValueOnce('v1')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            release = resolve
          }),
      )
    await memo('swr-b', 1000, loader, options)
    vi.setSystemTime(Date.now() + 1500)
    const answers = await Promise.all([memo('swr-b', 1000, loader, options), memo('swr-b', 1000, loader, options)])
    expect(answers).toEqual(['v1', 'v1'])
    expect(loader).toHaveBeenCalledTimes(2) // the first load plus ONE reload
    release('v2')
    await vi.advanceTimersByTimeAsync(0)
    expect(await memo('swr-b', 1000, loader, options)).toBe('v2')
  })

  it('keeps serving the old value when the background reload fails, and retries after a pause', async () => {
    const loader = vi
      .fn()
      .mockResolvedValueOnce('v1')
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('v3')
    await memo('swr-c', 1000, loader, { staleMs: 60_000 })
    vi.setSystemTime(Date.now() + 1500)
    expect(await memo('swr-c', 1000, loader, { staleMs: 60_000 })).toBe('v1') // starts the failing reload
    await vi.advanceTimersByTimeAsync(0)
    expect(loader).toHaveBeenCalledTimes(2)

    expect(await memo('swr-c', 1000, loader, { staleMs: 60_000 })).toBe('v1') // inside the retry pause: no new reload
    expect(loader).toHaveBeenCalledTimes(2)

    vi.setSystemTime(Date.now() + 11_000) // pause over
    expect(await memo('swr-c', 1000, loader, { staleMs: 60_000 })).toBe('v1')
    await vi.advanceTimersByTimeAsync(0)
    expect(loader).toHaveBeenCalledTimes(3)
    expect(await memo('swr-c', 1000, loader, { staleMs: 60_000 })).toBe('v3')
  })

  it('waits for the loader again once the stale window is over', async () => {
    const loader = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')
    await memo('swr-d', 1000, loader, options)
    vi.setSystemTime(Date.now() + 1000 + 5000 + 1) // past ttl + stale window
    expect(await memo('swr-d', 1000, loader, options)).toBe('v2')
  })

  it('does not serve an expired value without a stale window', async () => {
    const loader = vi.fn().mockResolvedValueOnce('v1').mockResolvedValueOnce('v2')
    await memo('swr-e', 1000, loader)
    vi.setSystemTime(Date.now() + 1500)
    expect(await memo('swr-e', 1000, loader)).toBe('v2')
  })

  it('a clearCache during a background reload keeps its result out of the cache', async () => {
    let release: (v: string) => void = () => {}
    const loader = vi
      .fn()
      .mockResolvedValueOnce('v1')
      .mockImplementationOnce(
        () =>
          new Promise<string>((resolve) => {
            release = resolve
          }),
      )
      .mockResolvedValueOnce('v3')
    await memo('swr-f', 1000, loader, options)
    vi.setSystemTime(Date.now() + 1500)
    await memo('swr-f', 1000, loader, options) // starts the slow reload
    clearCache()
    release('stale-result')
    await vi.advanceTimersByTimeAsync(0)
    expect(await memo('swr-f', 1000, loader, options)).toBe('v3') // loaded again, the old result was not stored
  })
})

describe('memoMetric', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.useRealTimers()
  })

  it('serves an old answer for METRIC_STALE_SECONDS after METRIC_FRESH_SECONDS', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.stubEnv('METRIC_FRESH_SECONDS', '10')
    vi.stubEnv('METRIC_STALE_SECONDS', '100')
    clearCache()
    const loader = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b')
    expect(await memoMetric('swr-metric', { x: 1 }, loader)).toBe('a')
    vi.setSystemTime(Date.now() + 20_000)
    expect(await memoMetric('swr-metric', { x: 1 }, loader)).toBe('a')
    await vi.advanceTimersByTimeAsync(0)
    expect(await memoMetric('swr-metric', { x: 1 }, loader)).toBe('b')
  })

  it('METRIC_STALE_SECONDS=0 turns the stale window off, and a bad value falls back to the default', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.stubEnv('METRIC_FRESH_SECONDS', '10')
    vi.stubEnv('METRIC_STALE_SECONDS', '0')
    clearCache()
    const loader = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b')
    await memoMetric('swr-off', {}, loader)
    vi.setSystemTime(Date.now() + 20_000)
    expect(await memoMetric('swr-off', {}, loader)).toBe('b') // waited for the new answer

    vi.stubEnv('METRIC_FRESH_SECONDS', 'banana') // invalid: the 60 s default applies
    clearCache()
    const loader2 = vi.fn().mockResolvedValue('c')
    await memoMetric('swr-bad', {}, loader2)
    vi.setSystemTime(Date.now() + 30_000)
    await memoMetric('swr-bad', {}, loader2)
    expect(loader2).toHaveBeenCalledTimes(1) // still fresh after 30 s
  })

  it('without settings, an answer is fresh for 60 s and may be served old for 180 s more', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    vi.stubEnv('METRIC_FRESH_SECONDS', '')
    vi.stubEnv('METRIC_STALE_SECONDS', '')
    clearCache()
    const loader = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b').mockResolvedValueOnce('c')
    await memoMetric('swr-default', {}, loader)
    vi.setSystemTime(Date.now() + 61_000) // fresh time is over, still inside the stale window
    expect(await memoMetric('swr-default', {}, loader)).toBe('a')
    await vi.advanceTimersByTimeAsync(0) // the background load stores b
    vi.setSystemTime(Date.now() + 60_000 + 180_000 + 1) // past fresh + stale of b
    expect(await memoMetric('swr-default', {}, loader)).toBe('c') // waited for the loader
  })

  it('an explicit ttl gets no stale window', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
    clearCache()
    const loader = vi.fn().mockResolvedValueOnce('a').mockResolvedValueOnce('b')
    await memoMetric('swr-ttl', {}, loader, 1000)
    vi.setSystemTime(Date.now() + 1500)
    expect(await memoMetric('swr-ttl', {}, loader, 1000)).toBe('b')
  })
})
