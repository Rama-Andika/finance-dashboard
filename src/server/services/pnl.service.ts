import '@tanstack/react-start/server-only'
import type { AccountGroup, Id, MetricMeta, Money } from '~/lib/finance/types'
import { env } from '~/server/env'
import { memoMetric } from '~/server/cache'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedPeriods,
} from '~/server/context'
import { movementsByPeriods } from '~/server/repo/gl.repo'
import { postableAccountIds } from '~/lib/finance/coa-tree'
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

const PNL_ACCOUNT_GROUPS: AccountGroup[] = [
  'Revenue',
  'Cost Of Sales',
  'Expense',
  'Other Revenue',
  'Other Expense',
]

export function computePnl(filter: AppContextFilter): Promise<PnlResult> {
  return memoMetric('pnl', filter, () => computePnlUncached(filter))
}

function toPnlMovements(rows: Array<{ coaId: Id; periodId?: Id; debet: Money; credit: Money }>): PnlMovement[] {
  return rows.map((m) => ({ coaId: m.coaId, periodId: m.periodId ?? '', debet: m.debet, credit: m.credit }))
}

async function computePnlUncached(filter: AppContextFilter): Promise<PnlResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()

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
  const activePeriods = periods.filter((p) => filter.periodIds.includes(p.periodeId))
  const rawMovements = await movementsByPeriods({
    periods: activePeriods,
    segCol: filter.entitySegmentColumn,
    segIds: filter.segmentDetailIds,
    coaIds: pnlCoaIds,
    byPeriod: true,
  })

  const { lines } = buildPnl({ tree, movements: toPnlMovements(rawMovements), ociCoaIds })

  // 2. Compare period
  let compare: Record<PnlLineKey, Money> | null = null
  if (filter.compare && filter.compare.periodIds.length > 0) {
    const comparePeriods = periods.filter((p) =>
      filter.compare.periodIds.includes(p.periodeId),
    )
    const rawCompareMovements = await movementsByPeriods({
      periods: comparePeriods,
      segCol: filter.entitySegmentColumn,
      segIds: filter.segmentDetailIds,
      coaIds: pnlCoaIds,
      byPeriod: true,
    })

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
