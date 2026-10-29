import '@tanstack/react-start/server-only'
import type { Id, Period } from '~/lib/finance/types'
import { postableAccountIds } from '~/lib/finance/coa-tree'
import { PNL_ACCOUNT_GROUPS } from '~/lib/finance/account-groups'
import { resolveBaskets } from '~/lib/finance/basket-resolver'
import { findOciCoaIds } from '~/lib/finance/pnl'
import { env } from '~/server/env'
import { memoMetric } from '~/server/cache'
import { type AppContextFilter, getCachedCoaTree, getCachedPeriods } from '~/server/context'
import { movementsByPeriods, type MovementRow } from '~/server/repo/gl.repo'
import { loadAccountMapping } from '~/server/services/mapping.helper'

/**
 * Movements of every account the P&L-family pages need (P&L, OCI, Fixed Cost, Budget actuals,
 * Revenue comparison), read in ONE aggregation of `gl` ⨝ `gl_detail` per period set and shared.
 * Each page then filters the rows it wants in memory instead of scanning the GL again.
 */
export async function loadPlMovements(filter: AppContextFilter, periodIds: Id[]): Promise<MovementRow[]> {
  if (periodIds.length === 0) return []
  return memoMetric(
    'plMovements',
    { periodIds, segCol: filter.entitySegmentColumn, segIds: filter.segmentDetailIds },
    async () => {
      const [tree, periods] = await Promise.all([getCachedCoaTree(), getCachedPeriods()])
      const mapping = await loadAccountMapping(tree)
      const resolved = resolveBaskets(mapping, tree)

      const coaIds = Array.from(
        new Set<Id>([
          ...postableAccountIds(tree, PNL_ACCOUNT_GROUPS),
          ...findOciCoaIds(tree, env.ociRootCodes),
          ...resolved.fixedCost,
        ]),
      ).filter((id) => tree.byId.get(id)?.status === 'POSTABLE')
      if (coaIds.length === 0) return []

      const wanted = new Set(periodIds)
      const activePeriods: Period[] = periods.filter((p) => wanted.has(p.periodeId))
      return movementsByPeriods({
        periods: activePeriods,
        segCol: filter.entitySegmentColumn,
        segIds: filter.segmentDetailIds,
        coaIds,
        byPeriod: true,
      })
    },
  )
}

/** Rows of `all` that belong to the given accounts. */
export function onlyAccounts(all: readonly MovementRow[], coaIds: Iterable<Id>): MovementRow[] {
  const wanted = coaIds instanceof Set ? coaIds : new Set(coaIds)
  return all.filter((m) => wanted.has(m.coaId))
}
