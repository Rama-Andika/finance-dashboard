import { describe, expect, it } from 'vitest'
import { balanceSheetCoaRows } from 'tests/fixtures/balance-sheet.fixture'
import { buildCoaTree, type CoaRow } from '../coa/coa-tree'
import {
  CURRENT_EARNINGS_NODE_ID,
  buildBalanceSheet,
  changeOf,
  changeRatioOf,
  emptyStatement,
  type BalanceSheetNode,
} from './statement'
import type { Id, Money } from '../../core/types'

const tree = buildCoaTree(balanceSheetCoaRows)

/** A balanced set of balances: assets 300, liabilities 100, equity 200. */
const balances = new Map<Id, Money>([
  ['cash', '100.00'],
  ['bank', '50.00'],
  ['ar', '50.00'],
  ['equip', '120.00'],
  ['accdep', '-20.00'],
  ['ap', '80.00'],
  ['loan', '20.00'],
  ['capital', '150.00'],
  ['prior', '40.00'],
  ['current', '10.00'],
])

/** The same accounts at the year end: assets 260, liabilities 80, equity 180. */
const compareBalances = new Map<Id, Money>([
  ['cash', '80.00'],
  ['bank', '40.00'],
  ['ar', '30.00'],
  ['equip', '120.00'],
  ['accdep', '-10.00'],
  ['ap', '60.00'],
  ['loan', '20.00'],
  ['capital', '150.00'],
  ['prior', '30.00'],
  ['current', '0.00'],
])

const find = (nodes: BalanceSheetNode[], id: string): BalanceSheetNode | undefined => {
  for (const node of nodes) {
    if (node.id === id) return node
    const inside = find(node.children, id)
    if (inside) return inside
  }
  return undefined
}

describe('buildBalanceSheet', () => {
  const statement = buildBalanceSheet({ tree, balances, compareBalances: null, extraLines: [] })

  it('adds up the totals of both sides and finds them in balance', () => {
    expect(statement.totals).toEqual({
      assets: '300.00',
      liabilities: '100.00',
      equity: '200.00',
      liabilitiesEquity: '300.00',
      difference: '0.00',
    })
    expect(statement.compareTotals).toBeNull()
  })

  it('totals every group', () => {
    expect(statement.groupTotals).toEqual({
      'Liquid Assets': '200.00',
      'Fixed Assets': '100.00',
      'Other Assets': '0.00',
      'Current Liabilities': '80.00',
      'Long Term Liabilities': '20.00',
      Equity: '200.00',
    })
  })

  it('makes a header the sum of its accounts, a contra account lowering it', () => {
    expect(find(statement.assets.nodes, 'A1')?.amount).toBe('150.00')
    expect(find(statement.assets.nodes, 'FA')?.amount).toBe('100.00')
    expect(find(statement.assets.nodes, 'A')?.amount).toBe('300.00')
    expect(find(statement.assets.nodes, 'accdep')?.amount).toBe('-20.00')
  })

  it('keeps the tree order, the level and the header flag', () => {
    const root = statement.assets.nodes[0]
    expect(root).toMatchObject({ id: 'A', level: 1, isHeader: true, kind: 'account' })
    expect(root?.children.map((c) => c.id)).toEqual(['A1', 'ar', 'FA'])
    expect(find(statement.assets.nodes, 'cash')).toMatchObject({ level: 3, isHeader: false })
  })

  it('puts liabilities and equity on the second side and leaves the P&L accounts out', () => {
    expect(statement.liabilitiesEquity.nodes.map((n) => n.id)).toEqual(['L', 'E'])
    expect(find(statement.liabilitiesEquity.nodes, 'sales')).toBeUndefined()
    expect(find(statement.assets.nodes, 'ap')).toBeUndefined()
  })

  it('makes the sum of the top accounts of each side equal its total', () => {
    const sumOf = (nodes: BalanceSheetNode[]) => nodes.reduce((acc, n) => acc + Number(n.amount), 0)
    expect(sumOf(statement.assets.nodes)).toBe(300)
    expect(sumOf(statement.liabilitiesEquity.nodes)).toBe(300)
  })

  it('shows the difference when the sides do not balance', () => {
    const off = new Map(balances).set('capital', '140.00')
    const result = buildBalanceSheet({ tree, balances: off, compareBalances: null, extraLines: [] })
    expect(result.totals.difference).toBe('10.00')
  })

  it('treats an account without a balance as zero', () => {
    const result = buildBalanceSheet({ tree, balances: new Map(), compareBalances: null, extraLines: [] })
    expect(result.totals.assets).toBe('0.00')
    expect(find(result.assets.nodes, 'cash')?.amount).toBe('0.00')
  })
})

describe('buildBalanceSheet with a comparison', () => {
  const statement = buildBalanceSheet({ tree, balances, compareBalances, extraLines: [] })

  it('carries the comparison amount on every node', () => {
    expect(find(statement.assets.nodes, 'cash')?.compare).toBe('80.00')
    expect(find(statement.assets.nodes, 'A1')?.compare).toBe('120.00')
    expect(find(statement.assets.nodes, 'A')?.compare).toBe('260.00')
  })

  it('totals the comparison date on its own', () => {
    expect(statement.compareTotals).toEqual({
      assets: '260.00',
      liabilities: '80.00',
      equity: '180.00',
      liabilitiesEquity: '260.00',
      difference: '0.00',
    })
    expect(statement.compareGroupTotals?.Equity).toBe('180.00')
  })
})

describe('buildBalanceSheet with extra lines', () => {
  const noEarningsRows = balanceSheetCoaRows.filter((r) => r.coaId !== 'current' && r.coaId !== 'prior')
  const smallTree = buildCoaTree(noEarningsRows)
  const smallBalances = new Map(balances)
  smallBalances.delete('current')
  smallBalances.delete('prior')
  smallBalances.set('capital', '150.00')

  it('adds the earnings lines to the equity side and to the equity total', () => {
    const statement = buildBalanceSheet({
      tree: smallTree,
      balances: smallBalances,
      compareBalances: null,
      extraLines: [{ id: CURRENT_EARNINGS_NODE_ID, labelKey: 'currentYearEarnings', amount: '50.00', compare: null }],
    })
    const line = statement.liabilitiesEquity.nodes.at(-1)
    expect(line).toMatchObject({
      id: CURRENT_EARNINGS_NODE_ID,
      kind: 'virtual',
      labelKey: 'currentYearEarnings',
      name: '',
      level: 1,
      amount: '50.00',
    })
    expect(statement.groupTotals.Equity).toBe('200.00')
    expect(statement.totals.difference).toBe('0.00')
  })

  it('gives the extra line a comparison amount when the report compares', () => {
    const statement = buildBalanceSheet({
      tree: smallTree,
      balances: smallBalances,
      compareBalances: new Map(),
      extraLines: [{ id: CURRENT_EARNINGS_NODE_ID, labelKey: 'currentYearEarnings', amount: '50.00', compare: '5.00' }],
    })
    expect(statement.liabilitiesEquity.nodes.at(-1)?.compare).toBe('5.00')
    expect(statement.compareGroupTotals?.Equity).toBe('5.00')
  })
})

describe('buildBalanceSheet with a header that holds both sides', () => {
  const rows: CoaRow[] = [
    { ...balanceSheetCoaRows[0]!, coaId: 'M', code: '9', name: 'Mixed', parentId: '0' },
    { ...balanceSheetCoaRows[2]!, coaId: 'mx', code: '91', name: 'Mixed asset', parentId: 'M' },
    { ...balanceSheetCoaRows[9]!, coaId: 'my', code: '92', name: 'Mixed liability', parentId: 'M' },
  ]
  const mixedTree = buildCoaTree(rows)
  const result = buildBalanceSheet({
    tree: mixedTree,
    balances: new Map<Id, Money>([
      ['mx', '30.00'],
      ['my', '20.00'],
    ]),
    compareBalances: null,
    extraLines: [],
  })

  it('shows the header on both sides with the part that belongs to each', () => {
    expect(find(result.assets.nodes, 'M')?.amount).toBe('30.00')
    expect(find(result.liabilitiesEquity.nodes, 'M')?.amount).toBe('20.00')
    expect(find(result.assets.nodes, 'my')).toBeUndefined()
  })
})

describe('emptyStatement', () => {
  it('has no accounts and zero totals', () => {
    const empty = emptyStatement()
    expect(empty.assets.nodes).toEqual([])
    expect(empty.liabilitiesEquity.nodes).toEqual([])
    expect(empty.totals).toEqual({
      assets: '0.00',
      liabilities: '0.00',
      equity: '0.00',
      liabilitiesEquity: '0.00',
      difference: '0.00',
    })
    expect(Object.keys(empty.groupTotals)).toHaveLength(6)
  })
})

describe('changeRatioOf', () => {
  it('is the change divided by the comparison amount', () => {
    expect(changeRatioOf('300.00', '240.00')).toBe('0.25')
    expect(changeRatioOf('180.00', '240.00')).toBe('-0.25')
  })

  it('keeps the direction of the change when the comparison amount is negative', () => {
    expect(changeRatioOf('-50.00', '-100.00')).toBe('0.5')
    expect(changeRatioOf('-150.00', '-100.00')).toBe('-0.5')
  })

  it('is null without a comparison or with a zero comparison amount', () => {
    expect(changeRatioOf('300.00', null)).toBeNull()
    expect(changeRatioOf('300.00', '0.00')).toBeNull()
  })
})

describe('changeOf', () => {
  it('is current minus compare', () => {
    expect(changeOf('300.00', '260.00')).toBe('40.00')
    expect(changeOf('10.00', '25.50')).toBe('-15.50')
  })

  it('is null without a comparison', () => {
    expect(changeOf('300.00', null)).toBeNull()
  })
})
