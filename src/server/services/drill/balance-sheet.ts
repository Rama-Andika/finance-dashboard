import '@tanstack/react-start/server-only'
import { D } from '~/lib/core/money'
import type { BalanceSheetNode } from '~/lib/finance/balance-sheet/statement'
import { resolveBalanceTarget } from '~/lib/finance/balance-sheet/targets'
import type { DrillStep, DrillStepKind } from '~/lib/filters/search-schema'
import { computeBalanceSheet } from '~/server/services/balance-sheet/balance-sheet.service'
import {
  ACCOUNT_COLUMNS,
  empty,
  journalRows,
  type DrillContext,
  type DrillResult,
} from '~/server/services/drill/shared'

/** The postable accounts below the given nodes, in tree order; a line the report adds itself is not an account. */
function accountsBelow(nodes: readonly BalanceSheetNode[]): BalanceSheetNode[] {
  return nodes.flatMap((node) => [
    ...(node.kind === 'account' && !node.isHeader ? [node] : []),
    ...accountsBelow(node.children),
  ])
}

/** Every node with the given id in a tree (a header that holds both sides appears on both sides). */
function nodesWithId(nodes: readonly BalanceSheetNode[], id: string): BalanceSheetNode[] {
  return nodes.flatMap((node) => [...(node.id === id ? [node] : []), ...nodesWithId(node.children, id)])
}

/** The accounts below the nodes with their balance at the report date; accounts without a balance are left out. */
function balanceAccountRows(nodes: readonly BalanceSheetNode[], label: string): DrillResult {
  const rows = accountsBelow(nodes)
    .filter((node) => !D(node.amount).isZero())
    .map((node) => ({ id: node.id, code: node.code, name: node.name, amount: node.amount }))
  return {
    titleKey: 'drill.title.accounts',
    titleLabel: label,
    columns: ACCOUNT_COLUMNS,
    rows,
    nextKind: 'account',
    hasMore: false,
  }
}

/**
 * Balance Sheet drill-down. A section or a header opens the accounts below it with their balances (the same numbers as
 * the table). An account opens the journal lines posted in the report period (and its period 13 when included): the
 * movement of the period, which together with the opening balance makes the balance.
 */
export async function balanceSheetDrill(ctx: DrillContext, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
  const accountStep = steps.get('account')
  if (accountStep) {
    const target = resolveBalanceTarget(ctx.periods, ctx.filter)
    if (!target) return empty('drill.title.journals', accountStep.label)
    const activePeriods = target.p13 ? [target.period, target.p13] : [target.period]
    return journalRows({ ...ctx, activePeriods }, [accountStep.id], ctx.filter.segmentDetailIds, accountStep.label)
  }

  const { statement } = await computeBalanceSheet(ctx.filter, 'none')
  const folderStep = steps.get('folder')
  if (folderStep) {
    const nodes = [
      ...nodesWithId(statement.assets.nodes, folderStep.id),
      ...nodesWithId(statement.liabilitiesEquity.nodes, folderStep.id),
    ]
    return balanceAccountRows(nodes, folderStep.label)
  }

  const sectionStep = steps.get('section')
  if (sectionStep) {
    const nodes =
      sectionStep.id === 'assets'
        ? statement.assets.nodes
        : sectionStep.id === 'liabilitiesEquity'
          ? statement.liabilitiesEquity.nodes
          : []
    return balanceAccountRows(nodes, sectionStep.label)
  }
  return empty('drill.title.accounts', '')
}
