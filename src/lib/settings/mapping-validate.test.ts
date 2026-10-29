import { describe, expect, it } from 'vitest'
import { validateMapping } from './mapping-validate'
import { buildCoaTree } from '~/lib/finance/coa-tree'
import { mockCoaRows } from 'tests/fixtures/coa.fixture'
import type { AccountMapping } from '~/lib/finance/basket-resolver'

describe('validateMapping', () => {
  const tree = buildCoaTree(mockCoaRows)
  const kasOperasional = '504404509311573862'
  const bankMandiri = '504404509311573863'

  it('detects conflict when an account is resolved in both cash and bank', () => {
    const conflictedMapping: AccountMapping = {
      version: 1,
      updatedAt: '2026-10-29T00:00:00Z',
      baskets: {
        cash: { include: [kasOperasional] },
        bank: { include: [kasOperasional] }, // Conflict!
        deposit: { include: [] },
        inTransit: { include: [] },
        fixedCost: { include: [] },
      },
    }

    const { blocking } = validateMapping(conflictedMapping, tree)
    expect(blocking.length).toBe(1)
    expect(blocking[0]).toEqual({
      kind: 'conflict',
      coaId: kasOperasional,
      baskets: ['cash', 'bank'],
    })
  })

  it('allows accounts in fixedCost to overlap with liquid baskets without conflict', () => {
    const mappingWithFixedCostOverlap: AccountMapping = {
      version: 1,
      updatedAt: '2026-10-29T00:00:00Z',
      baskets: {
        cash: { include: [kasOperasional] },
        bank: { include: [bankMandiri] },
        deposit: { include: [] },
        inTransit: { include: [] },
        fixedCost: { include: [kasOperasional] }, // Allowed! fixedCost is not a liquid basket
      },
    }

    const { blocking } = validateMapping(mappingWithFixedCostOverlap, tree)
    expect(blocking).toEqual([])
  })

  it('warns when both cash and bank are empty', () => {
    const emptyCashBankMapping: AccountMapping = {
      version: 1,
      updatedAt: '2026-10-29T00:00:00Z',
      baskets: {
        cash: { include: [] },
        bank: { include: [] },
        deposit: { include: [] },
        inTransit: { include: [] },
        fixedCost: { include: [] },
      },
    }

    const { warnings } = validateMapping(emptyCashBankMapping, tree)
    expect(warnings.some((w) => w.kind === 'cashBankEmpty')).toBe(true)
  })

  it('warns when missing accounts are present', () => {
    const mappingWithMissing: AccountMapping = {
      version: 1,
      updatedAt: '2026-10-29T00:00:00Z',
      baskets: {
        cash: { include: [kasOperasional, 'deleted_acc_999'] },
        bank: { include: [] },
        deposit: { include: [] },
        inTransit: { include: [] },
        fixedCost: { include: [] },
      },
    }

    const { warnings } = validateMapping(mappingWithMissing, tree)
    expect(warnings.some((w) => w.kind === 'missing' && w.coaId === 'deleted_acc_999')).toBe(true)
  })
})
