import '@tanstack/react-start/server-only'
import { type Id } from '~/lib/core/types'
import { postableAccountIds } from '~/lib/finance/coa/coa-tree'
import type { AccountGroup } from '~/lib/core/types'
import { resolveBaskets } from '~/lib/finance/coa/basket-resolver'
import { loadAccountMapping } from '~/server/services/shared/mapping.helper'
import { type DrillState, type DrillStep, type DrillStepKind } from '~/lib/filters/search-schema'
import { empty, accountIdsOf, segIdsFor, hasSingleEntity, accountRows, entityRows, journalRows, type DrillContext, type DrillResult } from '~/server/services/drill/shared'

// ---------------------------------------------------------------------------
// GL-based metrics: revenue, P&L, fixed cost, budget (and generic folders)
// ---------------------------------------------------------------------------

const PNL_LINE_GROUPS: Record<string, AccountGroup> = {
  revenue: 'Revenue',
  cogs: 'Cost Of Sales',
  opex: 'Expense',
  otherRevenue: 'Other Revenue',
  otherExpense: 'Other Expense',
}

/** Accounts behind a section of the P&L or Fixed Cost page. */
async function sectionAccountIds(ctx: DrillContext, metric: string, sectionId: string): Promise<Id[]> {
  if (metric === 'pnl') {
    const group = PNL_LINE_GROUPS[sectionId]
    return group ? postableAccountIds(ctx.tree, [group]) : []
  }
  if (metric === 'fixedCost') {
    const resolved = resolveBaskets(await loadAccountMapping(ctx.tree), ctx.tree)
    const fixed = new Set(resolved.fixedCost)
    if (sectionId === 'fixed') return resolved.fixedCost
    if (sectionId === 'variable') return postableAccountIds(ctx.tree, ['Expense']).filter((id) => !fixed.has(id))
  }
  return accountIdsOf(ctx.tree, sectionId)
}

export async function glMetricDrill(ctx: DrillContext, drill: DrillState, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
  const sectionStep = steps.get('section')
  const folderStep = steps.get('folder')
  const accountStep = steps.get('account')
  const entityStep = steps.get('entity')

  if (accountStep) {
    const node = ctx.tree.byId.get(accountStep.id)
    // A HEADER clicked as "account" (budget rows) behaves like a folder.
    if (node && node.status === 'HEADER' && !entityStep) {
      return accountRows(ctx, accountIdsOf(ctx.tree, accountStep.id), accountStep.label)
    }
    const coaIds = node && node.status === 'HEADER' ? accountIdsOf(ctx.tree, accountStep.id) : [accountStep.id]
    if (entityStep || hasSingleEntity(ctx)) {
      return journalRows(ctx, coaIds, segIdsFor(ctx, entityStep), (entityStep ?? accountStep).label)
    }
    return entityRows(ctx, coaIds, accountStep.label)
  }

  if (folderStep) return accountRows(ctx, accountIdsOf(ctx.tree, folderStep.id), folderStep.label)
  if (sectionStep) {
    return accountRows(ctx, await sectionAccountIds(ctx, drill.metric, sectionStep.id), sectionStep.label)
  }
  return empty('drill.title.accounts', '')
}

