import { describe, expect, it } from 'vitest'
import { buildCoaTree, postableDescendants, ancestorsOf, type CoaRow } from './coa-tree'
import { mockCoaRows } from 'tests/fixtures/coa.fixture'

describe('buildCoaTree', () => {
  it('builds tree from parentId and keeps 18+ digit IDs as strings', () => {
    const tree = buildCoaTree(mockCoaRows)

    expect(tree.roots.length).toBe(2) // Harta & Kewajiban
    const harta = tree.roots.find((r) => r.code === '1-0000')!
    expect(harta.coaId).toBe('504404509311573860')
    expect(harta.children.length).toBe(2) // Kas & Setara Kas (1-1000) and Bank BCA (1-9999)

    // Verify 1-9999 is directly under 1-0000 regardless of code prefix
    const bca = harta.children.find((c) => c.code === '1-9999')!
    expect(bca.name).toBe('Bank BCA Langsung')
  })

  it('sorts children by code then coaId', () => {
    const tree = buildCoaTree(mockCoaRows)
    const harta = tree.roots.find((r) => r.code === '1-0000')!
    expect(harta.children[0]!.code).toBe('1-1000')
    expect(harta.children[1]!.code).toBe('1-9999')
  })

  it('puts orphaned nodes into virtual __orphans__ folder', () => {
    const rowsWithOrphan: CoaRow[] = [
      ...mockCoaRows,
      {
        coaId: '999999999999999999',
        parentId: '888888888888888888', // non-existent parent
        code: '9-9999',
        name: 'Orphan Account',
        status: 'POSTABLE',
        level: 4,
        accountGroup: 'Other Expense',
        subAccountGroup: '',
        saldoNormal: 'DEBET',
      },
    ]

    const tree = buildCoaTree(rowsWithOrphan)
    const orphanFolder = tree.roots.find((r) => r.coaId === '__orphans__')
    expect(orphanFolder).toBeDefined()
    expect(orphanFolder?.children.some((c) => c.coaId === '999999999999999999')).toBe(true)
    expect(tree.byId.get('999999999999999999')?.isOrphan).toBe(true)
  })

  it('detects cycles without infinite loops and moves cycle nodes to orphans', () => {
    const rowsWithCycle: CoaRow[] = [
      {
        coaId: '100',
        parentId: '200', // 100 -> 200
        code: 'C-1',
        name: 'Cycle Node 1',
        status: 'HEADER',
        level: 1,
        accountGroup: 'Liquid Assets',
        subAccountGroup: '',
        saldoNormal: 'DEBET',
      },
      {
        coaId: '200',
        parentId: '100', // 200 -> 100
        code: 'C-2',
        name: 'Cycle Node 2',
        status: 'HEADER',
        level: 2,
        accountGroup: 'Liquid Assets',
        subAccountGroup: '',
        saldoNormal: 'DEBET',
      },
    ]

    const tree = buildCoaTree(rowsWithCycle)
    const orphanFolder = tree.roots.find((r) => r.coaId === '__orphans__')
    expect(orphanFolder).toBeDefined()
    expect(tree.byId.get('100')?.isCycle || tree.byId.get('200')?.isCycle).toBe(true)
  })
})

describe('postableDescendants', () => {
  it('returns all POSTABLE descendants of a HEADER recursively', () => {
    const tree = buildCoaTree(mockCoaRows)
    const descendants = postableDescendants(tree, '504404509311573860') // HARTA header
    // Descendants should include 1-1100, 1-1200, 1-9999
    expect(descendants).toContain('504404509311573862') // Kas Operasional
    expect(descendants).toContain('504404509311573863') // Bank Mandiri
    expect(descendants).toContain('504404509311573864') // Bank BCA Langsung
    expect(descendants.length).toBe(3)
  })

  it('returns itself when called on a POSTABLE account', () => {
    const tree = buildCoaTree(mockCoaRows)
    const descendants = postableDescendants(tree, '504404509311573862')
    expect(descendants).toEqual(['504404509311573862'])
  })

  it('returns empty array for unknown ID', () => {
    const tree = buildCoaTree(mockCoaRows)
    expect(postableDescendants(tree, 'non_existent_id')).toEqual([])
  })
})

describe('ancestorsOf', () => {
  it('returns all ancestor IDs from direct parent up to root', () => {
    const tree = buildCoaTree(mockCoaRows)
    // 504404509311573862 (Kas Operasional) -> parent 504404509311573861 (Kas & Bank) -> parent 504404509311573860 (Harta)
    const ancestors = ancestorsOf(tree, '504404509311573862')
    expect(ancestors).toEqual(['504404509311573861', '504404509311573860'])
  })

  it('returns empty array for root node', () => {
    const tree = buildCoaTree(mockCoaRows)
    expect(ancestorsOf(tree, '504404509311573860')).toEqual([])
  })
})
