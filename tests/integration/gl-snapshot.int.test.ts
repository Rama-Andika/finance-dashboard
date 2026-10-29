import { describe, expect, it } from 'vitest'
import { getCachedEntities, getCachedPeriods } from '~/server/context'
import { builtGlPeriods } from '~/server/dash/gl-snapshot'
import { movementsByPeriods, type MovementRow } from '~/server/repo/gl.repo'
import { clearCache } from '~/server/cache'
import type { Period } from '~/lib/finance/types'

/**
 * Closed-period GL movements from the snapshot must equal the live ERP query, for every option combination the
 * app uses (by period, by location, account groups, account subset, entity filter).
 * Needs the snapshot (`npm run dash:refresh-gl`); periods that are not in it yet are skipped.
 */
const TIMEOUT = 600_000

const key = (r: MovementRow) => `${r.coaId}|${r.periodId ?? ''}|${r.locationId ?? ''}`
const sorted = (list: MovementRow[]) => [...list].sort((a, b) => key(a).localeCompare(key(b)))

async function sample(): Promise<Period[]> {
  const [periods, built] = await Promise.all([getCachedPeriods(), builtGlPeriods()])
  const closedAndBuilt = periods.filter((p) => p.status === 'Closed' && built.has(p.periodeId))
  // newest, one from the middle and the oldest: they live in different gl tables when archives exist
  const picks = [closedAndBuilt.at(-1), closedAndBuilt[Math.floor(closedAndBuilt.length / 2)], closedAndBuilt[0]]
  return Array.from(new Map(picks.filter((p): p is Period => Boolean(p)).map((p) => [p.periodeId, p])).values())
}

async function both(opts: Parameters<typeof movementsByPeriods>[0]) {
  clearCache()
  const live = await movementsByPeriods({ ...opts, useSnapshot: false })
  clearCache()
  const snap = await movementsByPeriods({ ...opts, useSnapshot: true })
  return { live, snap }
}

describe('GL snapshot equals the live ERP query (closed periods)', () => {
  it('matches for all entities, by period and by location, with account groups', async () => {
    const periods = await sample()
    if (periods.length === 0) return console.warn('skipped: no closed period in the GL snapshot yet (npm run dash:refresh-gl)')

    for (const opts of [
      { segIds: 'all' as const, byPeriod: true },
      { segIds: 'all' as const, byPeriod: true, byLocation: true },
      { segIds: 'all' as const, accountGroups: ['Revenue', 'Expense'] as never },
      { segIds: 'all' as const },
    ]) {
      const { live, snap } = await both({ periods, segCol: 'segment1_id', ...opts })
      expect(live.length).toBeGreaterThan(0)
      expect(sorted(snap)).toEqual(sorted(live))
    }
  }, TIMEOUT)

  it('matches with an entity filter and an account subset', async () => {
    const periods = await sample()
    if (periods.length === 0) return console.warn('skipped: no closed period in the GL snapshot yet')

    const { entities } = await getCachedEntities()
    const segIds = entities.slice(0, 5).flatMap((e) => e.segmentDetailIds)
    const all = await both({ periods, segCol: 'segment1_id', segIds: 'all', byPeriod: true })
    const someCoa = Array.from(new Set(all.live.map((r) => r.coaId))).slice(0, 20)

    const { live, snap } = await both({ periods, segCol: 'segment1_id', segIds, coaIds: someCoa, byPeriod: true, byLocation: true })
    expect(sorted(snap)).toEqual(sorted(live))
  }, TIMEOUT)
})
