import { describe, it } from 'vitest'
import { clearCache } from '~/server/cache'
import { resolveFilter } from '~/server/context'
import { computeSummary } from '~/server/services/summary.service'

// Measuring only, not a correctness test: it times the Summary page the way the first visitor sees it.
// Skipped unless PERF_PROBE=1, so a normal `npm run test:db` does not pay for it. See docs/performance-measurement.md.
const TEST_TIMEOUT = 600000
const presets = ['this-month', 'last-month', 'ytd'] as const

describe.skipIf(process.env.PERF_PROBE !== '1')('Summary timing probe', () => {
  for (const preset of presets) {
    it(`cold then warm: ${preset}, all entities`, { timeout: TEST_TIMEOUT }, async () => {
      process.env.PERF_LOG = '1'
      clearCache()
      const filter = await resolveFilter({ entity: 'all', preset, p13: false })

      const coldStart = performance.now()
      await computeSummary(filter)
      const cold = Math.round(performance.now() - coldStart)

      const warmStart = performance.now()
      await computeSummary(filter)
      const warm = Math.round(performance.now() - warmStart)

      console.log(`PROBE summary ${preset}: cold ${cold}ms, warm ${warm}ms`)
    })
  }
})
