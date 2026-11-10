import { describe, expect, it } from 'vitest'
import { balanceSheetCoaRows } from 'tests/fixtures/balance-sheet.fixture'
import { buildCoaTree } from '../coa/coa-tree'
import { buildBalanceSheet, type BalanceSheetNode } from './statement'
import { defaultExpandedIds, pruneZeroNodes, tableRows } from './tree-view'
import type { Id, Money } from '../../core/types'

const tree = buildCoaTree(balanceSheetCoaRows)

const balances = new Map<Id, Money>([
  ['cash', '100.00'],
  ['bank', '0.00'],
  ['ar', '200.00'],
  ['ap', '300.00'],
  ['capital', '0.00'],
])

const statement = buildBalanceSheet({ tree, balances, compareBalances: null, extraLines: [] })

const idsOf = (nodes: BalanceSheetNode[]): string[] => nodes.flatMap((n) => [n.id, ...idsOf(n.children)])

describe('pruneZeroNodes', () => {
  it('drops accounts with no amount and the headers that become empty', () => {
    const kept = idsOf(pruneZeroNodes(statement.assets.nodes))
    expect(kept).toEqual(['A', 'A1', 'cash', 'ar'])
  })

  it('keeps an account that is zero now but not at the comparison date', () => {
    const withCompare = buildBalanceSheet({
      tree,
      balances,
      compareBalances: new Map<Id, Money>([['bank', '25.00']]),
      extraLines: [],
    })
    expect(idsOf(pruneZeroNodes(withCompare.assets.nodes))).toContain('bank')
  })

  it('keeps a header whose accounts add up to zero', () => {
    const net = new Map<Id, Money>([
      ['cash', '100.00'],
      ['bank', '-100.00'],
    ])
    const result = buildBalanceSheet({ tree, balances: net, compareBalances: null, extraLines: [] })
    const kept = idsOf(pruneZeroNodes(result.assets.nodes))
    expect(kept).toEqual(['A', 'A1', 'cash', 'bank'])
  })

  it('does not change the nodes it is given', () => {
    const before = JSON.stringify(statement.assets.nodes)
    pruneZeroNodes(statement.assets.nodes)
    expect(JSON.stringify(statement.assets.nodes)).toBe(before)
  })
})

describe('tableRows', () => {
  it('has the assets section and the liabilities and equity section with their totals', () => {
    const rows = tableRows(statement, { hideZero: false })
    expect(rows.map((r) => [r.id, r.kind, r.labelKey, r.amount])).toEqual([
      ['section:assets', 'section', 'sectionAssets', '300.00'],
      ['section:liabilitiesEquity', 'section', 'sectionLiabilitiesEquity', '300.00'],
    ])
    expect(rows[0]?.children.map((c) => c.id)).toEqual(['A'])
  })

  it('shows a difference line only when the sides differ', () => {
    expect(tableRows(statement, { hideZero: false }).some((r) => r.kind === 'difference')).toBe(false)
    const off = buildBalanceSheet({
      tree,
      balances: new Map<Id, Money>([['cash', '100.00']]),
      compareBalances: null,
      extraLines: [],
    })
    const rows = tableRows(off, { hideZero: false })
    expect(rows.at(-1)).toMatchObject({ kind: 'difference', amount: '100.00', labelKey: 'difference' })
  })

  it('shows the difference line when only the comparison date is out of balance', () => {
    const result = buildBalanceSheet({
      tree,
      balances: new Map<Id, Money>(),
      compareBalances: new Map<Id, Money>([['cash', '10.00']]),
      extraLines: [],
    })
    expect(tableRows(result, { hideZero: false }).at(-1)).toMatchObject({
      kind: 'difference',
      amount: '0.00',
      compare: '10.00',
    })
  })

  it('hides the zero accounts when asked to', () => {
    const rows = tableRows(statement, { hideZero: true })
    expect(idsOf(rows[0]!.children)).toEqual(['A', 'A1', 'cash', 'ar'])
  })
})

describe('defaultExpandedIds', () => {
  it('expands the sections and the top accounts only', () => {
    const rows = tableRows(statement, { hideZero: true })
    expect(defaultExpandedIds(rows)).toEqual({
      'section:assets': true,
      'section:liabilitiesEquity': true,
      A: true,
      L: true,
    })
  })

  it('does not list a row without children', () => {
    const rows = tableRows(statement, { hideZero: true })
    expect(defaultExpandedIds(rows)).not.toHaveProperty('cash')
  })
})
