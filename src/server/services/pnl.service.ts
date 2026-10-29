import '@tanstack/react-start/server-only'
import type { Id, MetricMeta, Money } from '~/lib/finance/types'
import { env } from '~/server/env'
import { memoMetric } from '~/server/cache'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
} from '~/server/context'
import { loadPlMovements, onlyAccounts } from '~/server/services/shared/pl-movements'
import { postableAccountIds } from '~/lib/finance/coa-tree'
import { PNL_ACCOUNT_GROUPS } from '~/lib/finance/account-groups'
import {
  buildPnl,
  findOciCoaIds,
  type PnlLine,
  type PnlLineKey,
  type PnlMovement,
} from '~/lib/finance/pnl'

export type PnlResult = {
  meta: MetricMeta
  lines: PnlLine[]
  compare: Record<PnlLineKey, Money> | null
}


export function computePnl(filter: AppContextFilter): Promise<PnlResult> {
  return memoMetric('pnl', filter, () => computePnlUncached(filter))
}

function toPnlMovements(rows: Array<{ coaId: Id; periodId?: Id; debet: Money; credit: Money }>): PnlMovement[] {
  return rows.map((m) => ({ coaId: m.coaId, periodId: m.periodId ?? '', debet: m.debet, credit: m.credit }))
}

async function computePnlUncached(filter: AppContextFilter): Promise<PnlResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()

  const ociCoaIds = findOciCoaIds(tree, env.ociRootCodes)

  // Collect all relevant postable CoA IDs
  const pnlCoaIds: Id[] = Array.from(
    new Set([...postableAccountIds(tree, PNL_ACCOUNT_GROUPS), ...ociCoaIds].filter((id) => tree.byId.get(id)?.status === 'POSTABLE')),
  )

  if (pnlCoaIds.length === 0 || filter.periodIds.length === 0) {
    const empty = buildPnl({ tree, movements: [], ociCoaIds })
    return {
      meta,
      lines: empty.lines,
      compare: null,
    }
  }

  // 1. Fetch movements for active periods
  const pnlSet = new Set(pnlCoaIds)
  const hasCompare = Boolean(filter.compare && filter.compare.periodIds.length > 0)
  const [allMovements, allCompareMovements] = await Promise.all([
    loadPlMovements(filter, filter.periodIds),
    hasCompare ? loadPlMovements(filter, filter.compare.periodIds) : Promise.resolve([]),
  ])
  const rawMovements = onlyAccounts(allMovements, pnlSet)

  const { lines } = buildPnl({ tree, movements: toPnlMovements(rawMovements), ociCoaIds })

  // 2. Compare period
  let compare: Record<PnlLineKey, Money> | null = null
  if (hasCompare) {
    const rawCompareMovements = onlyAccounts(allCompareMovements, pnlSet)

    const cmpPnl = buildPnl({ tree, movements: toPnlMovements(rawCompareMovements), ociCoaIds })
    const cmpRecord: Partial<Record<PnlLineKey, Money>> = {}
    for (const l of cmpPnl.lines) {
      cmpRecord[l.key] = l.amount
    }
    compare = cmpRecord as Record<PnlLineKey, Money>
  }

  return {
    meta,
    lines,
    compare,
  }
}
