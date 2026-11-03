import { describe, expect, it } from 'vitest'
import { qk } from './keys'

describe('query keys', () => {
  it('starts every metric, drill and data-check key with its prefix, so invalidating the prefix reaches them all', () => {
    expect(qk.metric('summary', {}).slice(0, qk.allMetrics().length)).toEqual(qk.allMetrics())
    expect(qk.drill({}).slice(0, qk.allDrills().length)).toEqual(qk.allDrills())
    expect(qk.dataChecks({}).slice(0, qk.allDataChecks().length)).toEqual(qk.allDataChecks())
  })

  it('keeps the three prefixes apart', () => {
    const prefixes = [qk.allMetrics()[0], qk.allDrills()[0], qk.allDataChecks()[0]]
    expect(new Set(prefixes).size).toBe(3)
  })
})
