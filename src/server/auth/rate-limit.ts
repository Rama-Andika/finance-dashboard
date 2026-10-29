export type RateLimiter = {
  hit(key: string, nowMs?: number): boolean
}

export function createRateLimiter(opts: { max: number; windowMs: number }): RateLimiter {
  const store = new Map<string, number[]>()

  return {
    hit(key: string, nowMs = Date.now()): boolean {
      const windowStart = nowMs - opts.windowMs

      // Prune expired keys periodically
      for (const [k, timestamps] of store.entries()) {
        const valid = timestamps.filter((t) => t > windowStart)
        if (valid.length === 0) {
          store.delete(k)
        } else if (valid.length !== timestamps.length) {
          store.set(k, valid)
        }
      }

      const existing = (store.get(key) ?? []).filter((t) => t > windowStart)

      if (existing.length >= opts.max) {
        store.set(key, existing)
        return false
      }

      existing.push(nowMs)
      store.set(key, existing)
      return true
    },
  }
}
