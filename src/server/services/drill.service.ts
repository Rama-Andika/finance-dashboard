import '@tanstack/react-start/server-only'
import { cardSettlementHistory } from '~/server/repo/apar.repo'
import { getCachedCoaTree, getCachedEntities, getCachedPeriods, type AppContextFilter } from '~/server/context'
import { D } from '~/lib/finance/money'
import type { DrillState, DrillStep, DrillStepKind } from '~/lib/filters/search-schema'
import { col, empty, type DrillContext, type DrillResult } from '~/server/services/drill/shared'
import { apArDrill, paymentPlanDrill } from '~/server/services/drill/ap-ar'
import { cashPositionDrill, inTransitDrill } from '~/server/services/drill/cash'
import { cashFlowDrill, expensePaidDrill } from '~/server/services/drill/cash-flow'
import { glMetricDrill } from '~/server/services/drill/gl-metrics'

export type { DrillState, DrillStep, DrillStepKind }
export type { DrillColumn, DrillColumnKind, DrillResult } from '~/server/services/drill/shared'

export async function computeDrill(
  filter: AppContextFilter,
  drill: DrillState,
  offset: number = 0,
): Promise<DrillResult> {
  const [tree, periods, { entities }] = await Promise.all([getCachedCoaTree(), getCachedPeriods(), getCachedEntities()])
  const ctx: DrillContext = {
    filter,
    tree,
    periods,
    activePeriods: periods.filter((p) => filter.periodIds.includes(p.periodeId)),
    entities,
    offset,
  }

  const steps = new Map<DrillStepKind, DrillStep>()
  for (const s of drill.steps ?? []) steps.set(s.kind, s)

  // Leaf: settlement history of an AP/AR card (any metric)
  const cardStep = steps.get('card')
  if (cardStep) {
    const history = await cardSettlementHistory(cardStep.id)
    return {
      titleKey: 'drill.title.history',
      titleLabel: cardStep.label,
      columns: [col('docNumber', 'code'), col('txDate', 'date'), col('amount', 'money')],
      rows: history.map((h) => ({
        id: String(h.cardId),
        docNumber: h.transactionNumber || String(h.cardId),
        txDate: String(h.txDate).slice(0, 10),
        amount: D(h.amount || 0).toFixed(2),
      })),
      nextKind: null,
      hasMore: false,
    }
  }

  switch (drill.metric) {
    case 'apAging':
    case 'arAging':
      return apArDrill(ctx, drill, steps)
    case 'paymentPlan': {
      const dayStep = steps.get('day')
      return dayStep ? paymentPlanDrill(ctx, dayStep) : empty('drill.title.dueBills', '')
    }
    case 'cashPosition':
      return cashPositionDrill(ctx, steps)
    case 'inTransit':
      return inTransitDrill(ctx, steps)
    case 'cashFlow':
      return cashFlowDrill(ctx, steps)
    case 'expensePaid':
      return expensePaidDrill(ctx, steps)
    default:
      // revenue, pnl, fixedCost, budget and generic folder drills
      return glMetricDrill(ctx, drill, steps)
  }
}

