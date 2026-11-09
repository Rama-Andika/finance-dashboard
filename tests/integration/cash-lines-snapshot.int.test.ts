import { describe, expect, it } from 'vitest'
import { getCachedCoaTree, getCachedEntities, getCachedPeriods } from '~/server/context'
import { builtCashPeriods } from '~/server/dash/cash-lines-read'
import { linesOfCashJournals, type CashJournalLineRow } from '~/server/repo/cash/cashflow.repo'
import { loadResolvedBaskets } from '~/server/services/shared/resolved-baskets'
import { allCashAccountIds } from '~/lib/finance/coa/basket-resolver'
import { clearCache, hashIds } from '~/server/cache'
import type { Id, Period } from '~/lib/core/types'

/**
 * The cash lines read from the snapshot must equal the live ERP query, for all entities and for one entity.
 * Needs the snapshot (`npm run dash:refresh-cash`); periods that are not in it are skipped.
 */
const TIMEOUT = 600_000

const key = (l: CashJournalLineRow) => `${l.glId}|${l.coaId}|${l.segmentDetailId ?? ''}|${l.periodId}|${l.journalType}`
const sorted = (list: CashJournalLineRow[]) => [...list].sort((a, b) => key(a).localeCompare(key(b)))

async function setup(): Promise<{ cashCoaIds: Id[]; periods: Period[] }> {
  const tree = await getCachedCoaTree()
  const cashCoaIds = allCashAccountIds(await loadResolvedBaskets(tree))
  const [periods, built] = await Promise.all([getCachedPeriods(), builtCashPeriods(hashIds(cashCoaIds))])
  const closedAndBuilt = periods.filter((p) => p.status === 'Closed' && built.has(p.periodeId))
  const picks = [closedAndBuilt.at(-1), closedAndBuilt[Math.floor(closedAndBuilt.length / 2)], closedAndBuilt[0]]
  return {
    cashCoaIds,
    periods: Array.from(new Map(picks.filter((p): p is Period => Boolean(p)).map((p) => [p.periodeId, p])).values()),
  }
}

async function both(opts: Parameters<typeof linesOfCashJournals>[0]) {
  clearCache()
  const live = await linesOfCashJournals({ ...opts, useSnapshot: false })
  clearCache()
  const snap = await linesOfCashJournals({ ...opts, useSnapshot: true })
  return { live, snap }
}

describe('cash lines snapshot equals the live ERP query (closed periods)', () => {
  it(
    'matches for all entities and for the first entity',
    async () => {
      const { cashCoaIds, periods } = await setup()
      if (periods.length === 0 || cashCoaIds.length === 0) {
        return console.warn('skipped: no closed period in the cash-lines snapshot yet (npm run dash:refresh-cash)')
      }
      const { entities } = await getCachedEntities()
      const firstEntity = entities[0]?.segmentDetailIds ?? []

      const all = await both({ periods, segCol: 'segment1_id', segIds: 'all', cashCoaIds })
      expect(all.live.length).toBeGreaterThan(0)
      expect(sorted(all.snap)).toEqual(sorted(all.live))

      if (firstEntity.length > 0) {
        const one = await both({ periods, segCol: 'segment1_id', segIds: firstEntity, cashCoaIds })
        expect(sorted(one.snap)).toEqual(sorted(one.live))
      }
    },
    TIMEOUT,
  )
})
