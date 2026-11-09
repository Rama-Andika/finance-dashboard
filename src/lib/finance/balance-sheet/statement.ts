import type Decimal from 'decimal.js'
import { D, sum } from '../../core/money'
import { ASSET_GROUPS, BALANCE_SHEET_GROUPS, EQUITY_GROUPS, LIABILITY_GROUPS } from '../coa/account-groups'
import type { CoaNode, CoaTree } from '../coa/coa-tree'
import type { AccountGroup, Id, Money } from '../../core/types'

/** Ids of the two lines the report adds itself when the ERP earnings account cannot be found. */
export const CURRENT_EARNINGS_NODE_ID = '__current_year_earnings__'
export const PRIOR_EARNINGS_NODE_ID = '__prior_years_earnings__'

/**
 * - section: "Assets" or "Liabilities and equity" with its total (built by `tableRows`);
 * - account: an account of the chart, a header (sum of its accounts) or a postable account;
 * - virtual: a line the report adds itself (an earnings line whose account was not found);
 * - difference: assets minus liabilities and equity, shown only when they differ.
 */
export type BalanceSheetNodeKind = 'section' | 'account' | 'virtual' | 'difference'

export type BalanceSheetNode = {
  id: Id
  kind: BalanceSheetNodeKind
  /** Account code; empty for the lines the report adds itself. */
  code: string
  /** Account name; empty for the lines the report adds itself (the client translates `labelKey`). */
  name: string
  /** Suffix of the i18n key `balanceSheet.line.<labelKey>` of a line the report adds itself; null for an account. */
  labelKey: string | null
  /** Depth in the account tree: 1 = top account; 0 for a section and the difference line. */
  level: number
  isHeader: boolean
  accountGroup: AccountGroup | null
  amount: Money
  /** Amount at the comparison date; null when the report has no comparison. */
  compare: Money | null
  children: BalanceSheetNode[]
}

/** A line the report adds to the liabilities and equity side (always equity). */
export type ExtraLine = { id: Id; labelKey: string; amount: Money; compare: Money | null }

export type BalanceTotals = {
  assets: Money
  liabilities: Money
  equity: Money
  liabilitiesEquity: Money
  /** assets minus liabilitiesEquity; zero when the balance sheet balances. */
  difference: Money
}

export type BalanceSheetStatement = {
  assets: { nodes: BalanceSheetNode[] }
  liabilitiesEquity: { nodes: BalanceSheetNode[] }
  totals: BalanceTotals
  compareTotals: BalanceTotals | null
  /** Total of each balance sheet account group (all six keys are present); equity includes the earnings lines. */
  groupTotals: Record<string, Money>
  compareGroupTotals: Record<string, Money> | null
}

export type StatementInput = {
  tree: CoaTree
  /** Balance of every postable balance sheet account, earnings accounts already adjusted. */
  balances: ReadonlyMap<Id, Money>
  /** Same at the comparison date; null when there is no comparison. */
  compareBalances: ReadonlyMap<Id, Money> | null
  extraLines: readonly ExtraLine[]
}

const isNode = (node: BalanceSheetNode | null): node is BalanceSheetNode => node !== null

/**
 * The accounts of one side as a tree. A header is the sum of the accounts below it that belong to this side, so a header
 * that holds accounts of both sides appears on both sides with the part that belongs to each. An account or header
 * without any account of this side is left out.
 */
function buildSide(
  input: StatementInput,
  groups: readonly AccountGroup[],
  extraLines: readonly ExtraLine[],
): BalanceSheetNode[] {
  const { tree, balances, compareBalances } = input
  const hasCompare = compareBalances !== null

  const build = (node: CoaNode, level: number): BalanceSheetNode | null => {
    const children = node.children.map((child) => build(child, level + 1)).filter(isNode)
    const isAccount = node.status === 'POSTABLE' && groups.includes(node.accountGroup)
    if (!isAccount && children.length === 0) return null
    const own = isAccount ? (balances.get(node.coaId) ?? '0.00') : '0.00'
    const ownCompare = isAccount ? (compareBalances?.get(node.coaId) ?? '0.00') : '0.00'
    return {
      id: node.coaId,
      kind: 'account',
      code: node.code,
      name: node.name,
      labelKey: null,
      level,
      isHeader: node.status === 'HEADER',
      accountGroup: node.accountGroup,
      amount: sum([own, ...children.map((c) => c.amount)]),
      compare: hasCompare ? sum([ownCompare, ...children.map((c) => c.compare)]) : null,
      children,
    }
  }

  const roots = tree.roots.map((root) => build(root, 1)).filter(isNode)
  for (const line of extraLines) {
    roots.push({
      id: line.id,
      kind: 'virtual',
      code: '',
      name: '',
      labelKey: line.labelKey,
      level: 1,
      isHeader: false,
      accountGroup: 'Equity',
      amount: line.amount,
      compare: hasCompare ? (line.compare ?? '0.00') : null,
      children: [],
    })
  }
  return roots
}

/** Total of every balance sheet group from the postable accounts (the orphan folder is a header, so it never counts). */
function groupTotalsOf(
  tree: CoaTree,
  balances: ReadonlyMap<Id, Money>,
  extraAmounts: readonly Money[],
): Record<string, Money> {
  const totals = new Map<AccountGroup, Decimal>(BALANCE_SHEET_GROUPS.map((group) => [group, D(0)]))
  for (const node of tree.byId.values()) {
    const current = totals.get(node.accountGroup)
    if (node.status !== 'POSTABLE' || current === undefined) continue
    totals.set(node.accountGroup, current.plus(D(balances.get(node.coaId))))
  }
  const equity = EQUITY_GROUPS[0] as AccountGroup
  totals.set(
    equity,
    extraAmounts.reduce((acc, amount) => acc.plus(D(amount)), totals.get(equity) ?? D(0)),
  )
  return Object.fromEntries(Array.from(totals, ([group, total]) => [group, total.toFixed(2)]))
}

function totalsOf(groupTotals: Record<string, Money>): BalanceTotals {
  const of = (groups: readonly AccountGroup[]): Money => sum(groups.map((group) => groupTotals[group]))
  const assets = of(ASSET_GROUPS)
  const liabilities = of(LIABILITY_GROUPS)
  const equity = of(EQUITY_GROUPS)
  const liabilitiesEquity = sum([liabilities, equity])
  return {
    assets,
    liabilities,
    equity,
    liabilitiesEquity,
    difference: D(assets).minus(D(liabilitiesEquity)).toFixed(2),
  }
}

/** The balance sheet: both sides as account trees, the totals per group and the difference between the sides. */
export function buildBalanceSheet(input: StatementInput): BalanceSheetStatement {
  const { tree, balances, compareBalances, extraLines } = input
  const groupTotals = groupTotalsOf(
    tree,
    balances,
    extraLines.map((line) => line.amount),
  )
  const compareGroupTotals = compareBalances
    ? groupTotalsOf(
        tree,
        compareBalances,
        extraLines.map((line) => line.compare ?? '0.00'),
      )
    : null
  return {
    assets: { nodes: buildSide(input, ASSET_GROUPS, []) },
    liabilitiesEquity: { nodes: buildSide(input, [...LIABILITY_GROUPS, ...EQUITY_GROUPS], extraLines) },
    totals: totalsOf(groupTotals),
    compareTotals: compareGroupTotals ? totalsOf(compareGroupTotals) : null,
    groupTotals,
    compareGroupTotals,
  }
}

/** A statement with no accounts and all-zero totals: what the page shows when the report month has no period. */
export function emptyStatement(): BalanceSheetStatement {
  const groupTotals = Object.fromEntries(BALANCE_SHEET_GROUPS.map((group) => [group, '0.00']))
  return {
    assets: { nodes: [] },
    liabilitiesEquity: { nodes: [] },
    totals: totalsOf(groupTotals),
    compareTotals: null,
    groupTotals,
    compareGroupTotals: null,
  }
}

/** current minus compare as a 2-decimal string; null when there is nothing to compare with. */
export function changeOf(current: Money, compare: Money | null): Money | null {
  return compare === null ? null : D(current).minus(D(compare)).toFixed(2)
}

/**
 * The change as a decimal ratio of the comparison amount (0.25 = 25%; the sign of the change is kept even when the
 * comparison amount is negative); null without a comparison or when the comparison amount is zero.
 */
export function changeRatioOf(current: Money, compare: Money | null): string | null {
  if (compare === null || D(compare).isZero()) return null
  return D(current).minus(D(compare)).div(D(compare).abs()).toString()
}
