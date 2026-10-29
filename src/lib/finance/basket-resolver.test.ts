import { describe, expect, it } from 'vitest'
import {
  resolveBaskets,
  checkState,
  toggleNode,
  type AccountMapping,
} from './basket-resolver'
import { buildCoaTree } from './coa-tree'
import { mockCoaRows } from 'tests/fixtures/coa.fixture'

describe('resolveBaskets', () => {
  const tree = buildCoaTree(mockCoaRows)

  it('resolves HEADER to all its POSTABLE descendants', () => {
    const mapping: AccountMapping = {
      version: 1,
      updatedAt: '2026-10-29T00:00:00Z',
      baskets: {
        cash: { include: ['504404509311573861'] }, // Kas & Setara Kas header
        bank: { include: ['504404509311573864'] }, // Bank BCA postable
        deposit: { include: [] },
        inTransit: { include: [] },
        fixedCost: { include: [] },
      },
    }

    const resolved = resolveBaskets(mapping, tree)
    // Kas & Setara Kas has 1-1100 (504404509311573862) and 1-1200 (504404509311573863)
    expect(resolved.cash).toEqual(['504404509311573862', '504404509311573863'])
    expect(resolved.bank).toEqual(['504404509311573864'])
    expect(resolved.missing).toEqual([])
  })

  it('collects unknown IDs into missing array without throwing', () => {
    const mapping: AccountMapping = {
      version: 1,
      updatedAt: '2026-10-29T00:00:00Z',
      baskets: {
        cash: { include: ['unknown_123', 'unknown_456'] },
        bank: { include: [] },
        deposit: { include: [] },
        inTransit: { include: [] },
        fixedCost: { include: [] },
      },
    }

    const resolved = resolveBaskets(mapping, tree)
    expect(resolved.cash).toEqual([])
    expect(resolved.missing).toEqual(['unknown_123', 'unknown_456'])
  })
})

describe('checkState & toggleNode', () => {
  const tree = buildCoaTree(mockCoaRows)
  const headerHarta = '504404509311573860'
  const headerKasBank = '504404509311573861'
  const kasOperasional = '504404509311573862'
  const bankMandiri = '504404509311573863'
  const bankBca = '504404509311573864'

  it('determines checkState accurately (checked, partial, unchecked)', () => {
    // Empty include
    expect(checkState([], tree, headerHarta)).toBe('unchecked')
    expect(checkState([], tree, kasOperasional)).toBe('unchecked')

    // Header KasBank included -> both KasOperasional and BankMandiri checked
    expect(checkState([headerKasBank], tree, headerKasBank)).toBe('checked')
    expect(checkState([headerKasBank], tree, kasOperasional)).toBe('checked')
    expect(checkState([headerKasBank], tree, bankMandiri)).toBe('checked')

    // Since KasBank is only part of Harta (Bank BCA is also under Harta), Harta is partial
    expect(checkState([headerKasBank], tree, headerHarta)).toBe('partial')

    // When only 1 of 2 postables under KasBank is checked
    expect(checkState([kasOperasional], tree, headerKasBank)).toBe('partial')
    expect(checkState([kasOperasional], tree, kasOperasional)).toBe('checked')
    expect(checkState([kasOperasional], tree, bankMandiri)).toBe('unchecked')
  })

  it('toggles HEADER when some children were previously checked, consolidating to HEADER only', () => {
    // Initially only kasOperasional is checked
    const initial = [kasOperasional]
    // Toggling headerKasBank should check the whole header and prune kasOperasional
    const next = toggleNode(initial, tree, headerKasBank)
    expect(next).toEqual([headerKasBank])
    expect(checkState(next, tree, headerKasBank)).toBe('checked')
  })

  it('unchecking a child under a checked HEADER expands siblings and sets HEADER to partial', () => {
    // Header KasBank is checked
    const initial = [headerKasBank]
    // Uncheck kasOperasional
    const next = toggleNode(initial, tree, kasOperasional)
    // Sibling bankMandiri should now be explicitly included
    expect(next).toEqual([bankMandiri])
    expect(checkState(next, tree, headerKasBank)).toBe('partial')
    expect(checkState(next, tree, kasOperasional)).toBe('unchecked')
    expect(checkState(next, tree, bankMandiri)).toBe('checked')
  })
})
