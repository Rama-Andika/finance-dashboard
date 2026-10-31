import { describe, expect, it } from 'vitest'
import { buildCoaTree, type CoaRow } from './coa-tree'
import { flattenVisible, matchingCoaIds } from './coa-tree-view'

const row = (coaId: string, parentId: string, code: string, name: string, status: 'HEADER' | 'POSTABLE'): CoaRow => ({
  coaId, parentId, code, name, status, level: 1, accountGroup: 'Liquid Assets', subAccountGroup: '', saldoNormal: 'DEBET',
})

const tree = buildCoaTree([
  row('1', '0', '1-0000', 'Assets', 'HEADER'),
  row('11', '1', '1-1000', 'Cash', 'HEADER'),
  row('111', '11', '1-1100', 'Petty cash', 'POSTABLE'),
  row('112', '11', '1-1200', 'Bank', 'POSTABLE'),
  row('12', '1', '1-2000', 'Receivables', 'POSTABLE'),
  row('2', '0', '2-0000', 'Liabilities', 'HEADER'),
  row('21', '2', '2-1000', 'Payables', 'POSTABLE'),
])

describe('matchingCoaIds', () => {
  it('returns null for an empty or blank query', () => {
    expect(matchingCoaIds(tree, '')).toBeNull()
    expect(matchingCoaIds(tree, '   ')).toBeNull()
  })

  it('matches name or code, ignoring case, and adds every ancestor', () => {
    expect(Array.from(matchingCoaIds(tree, 'PETTY')!).sort()).toEqual(['1', '11', '111'])
    expect(Array.from(matchingCoaIds(tree, '2-1000')!).sort()).toEqual(['2', '21'])
  })

  it('when a folder matches, includes all its descendants so its contents can be viewed', () => {
    // 'Cash' matches folder 11, so root 1 (ancestor) and children 111, 112 (descendants) are included
    expect(Array.from(matchingCoaIds(tree, 'Cash')!).sort()).toEqual(['1', '11', '111', '112'])
  })

  it('returns an empty set when nothing matches', () => {
    expect(matchingCoaIds(tree, 'zzz')?.size).toBe(0)
  })
})

describe('flattenVisible', () => {
  const ids = (items: ReturnType<typeof flattenVisible>) => items.map((i) => [i.node.coaId, i.depth, i.isExpanded])

  it('lists only the roots when nothing is expanded', () => {
    expect(ids(flattenVisible(tree, new Set(), null))).toEqual([['1', 0, false], ['2', 0, false]])
  })

  it('shows the children of an expanded branch, in tree order', () => {
    expect(ids(flattenVisible(tree, new Set(['1', '11']), null))).toEqual([
      ['1', 0, true], ['11', 1, true], ['111', 2, false], ['112', 2, false], ['12', 1, false], ['2', 0, false],
    ])
  })

  it('reports which rows have children', () => {
    const items = flattenVisible(tree, new Set(['1']), null)
    expect(items.map((i) => [i.node.coaId, i.hasChildren])).toEqual([['1', true], ['11', true], ['12', false], ['2', true]])
  })

  it('while searching, lists only matching branches and opens all of them by default', () => {
    const matching = matchingCoaIds(tree, 'bank')
    expect(ids(flattenVisible(tree, new Set(), matching))).toEqual([['1', 0, true], ['11', 1, true], ['112', 2, true]])
  })

  it('while searching, respects collapsedIds if user manually collapses a branch', () => {
    const matching = matchingCoaIds(tree, 'Cash')
    // 11 is collapsed by user, so its children (111, 112) are hidden
    expect(ids(flattenVisible(tree, new Set(), matching, new Set(['11'])))).toEqual([
      ['1', 0, true],
      ['11', 1, false],
    ])
  })
})
