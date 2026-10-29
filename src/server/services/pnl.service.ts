import '@tanstack/react-start/server-only'
import type { AccountGroup, Id, MetricMeta, Money } from '~/lib/finance/types'
import { env } from '~/server/env'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedPeriods,
} from '~/server/context'
import { movementsByPeriods } from '~/server/repo/gl.repo'
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

export async function computePnl(filter: AppContextFilter): Promise<PnlResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()

  const ociCoaIds = findOciCoaIds(tree, env.ociRootCodes)

  // Collect all relevant postable CoA IDs
  const pnlCoaIds: Id[] = []
  for (const node of tree.byId.values()) {
    if (node.status === 'POSTABLE' && node.coaId !== '__orphans__') {
      if (PNL_ACCOUNT_GROUPS.includes(node.accountGroup) || ociCoaIds.has(node.coaId)) {
        pnlCoaIds.push(node.coaId)
      }
    }
  }

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

  const movements: PnlMovement[] = rawMovements.map((m) => ({
    coaId: m.coaId,
    periodId: m.periodId ?? '',
    debet: m.debet,
    credit: m.credit,
  }))

  const { lines } = buildPnl({ tree, movements, ociCoaIds })

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

    const cmpMovements: PnlMovement[] = rawCompareMovements.map((m) => ({
      coaId: m.coaId,
      periodId: m.periodId ?? '',
      debet: m.debet,
      credit: m.credit,
    }))

    const cmpPnl = buildPnl({ tree, movements: cmpMovements, ociCoaIds })
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
