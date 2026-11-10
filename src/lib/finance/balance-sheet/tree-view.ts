import { D } from '../../core/money'
import type { BalanceSheetNode, BalanceSheetStatement } from './statement'

/** The account is shown with nothing to report: both the amount and the comparison amount are zero. */
const isZeroNode = (node: BalanceSheetNode): boolean => D(node.amount).isZero() && D(node.compare).isZero()

/**
 * Drops the accounts whose amount and comparison amount are both zero, and the headers that are left without a child.
 * A header whose children add up to zero stays, because its children are not zero.
 */
export function pruneZeroNodes(nodes: readonly BalanceSheetNode[]): BalanceSheetNode[] {
  const kept: BalanceSheetNode[] = []
  for (const node of nodes) {
    const children = pruneZeroNodes(node.children)
    if (children.length === 0 && isZeroNode(node)) continue
    kept.push({ ...node, children })
  }
  return kept
}

function section(
  id: string,
  labelKey: string,
  amount: string,
  compare: string | null,
  children: BalanceSheetNode[],
): BalanceSheetNode {
  return {
    id,
    kind: 'section',
    code: '',
    name: '',
    labelKey,
    level: 0,
    isHeader: true,
    accountGroup: null,
    amount,
    compare,
    children,
  }
}

/**
 * The rows of the balance sheet table: the assets section, the liabilities and equity section (each with its total and its
 * accounts below it) and, only when the two sides differ, a difference line.
 */
export function tableRows(statement: BalanceSheetStatement, options: { hideZero: boolean }): BalanceSheetNode[] {
  const { totals, compareTotals } = statement
  const prune = (nodes: BalanceSheetNode[]) => (options.hideZero ? pruneZeroNodes(nodes) : nodes)

  const rows: BalanceSheetNode[] = [
    section(
      'section:assets',
      'sectionAssets',
      totals.assets,
      compareTotals?.assets ?? null,
      prune(statement.assets.nodes),
    ),
    section(
      'section:liabilitiesEquity',
      'sectionLiabilitiesEquity',
      totals.liabilitiesEquity,
      compareTotals?.liabilitiesEquity ?? null,
      prune(statement.liabilitiesEquity.nodes),
    ),
  ]

  const differs = !D(totals.difference).isZero() || (compareTotals !== null && !D(compareTotals.difference).isZero())
  if (differs) {
    rows.push({
      id: 'difference',
      kind: 'difference',
      code: '',
      name: '',
      labelKey: 'difference',
      level: 0,
      isHeader: true,
      accountGroup: null,
      amount: totals.difference,
      compare: compareTotals?.difference ?? null,
      children: [],
    })
  }
  return rows
}

/** Rows that start expanded: the sections and the top accounts, so the table opens down to the second level. */
export function defaultExpandedIds(rows: readonly BalanceSheetNode[]): Record<string, boolean> {
  const expanded: Record<string, boolean> = {}
  const visit = (node: BalanceSheetNode) => {
    if (node.children.length > 0 && node.level < 2) expanded[node.id] = true
    node.children.forEach(visit)
  }
  rows.forEach(visit)
  return expanded
}
