import { describe, expect, it } from 'vitest'
import { parseMapping, defaultMapping, mappingSchema } from './mapping-schema'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import { mockCoaRows } from 'tests/fixtures/coa.fixture'

describe('mappingSchema & parseMapping', () => {
  const validMapping = {
    version: 1,
    updatedAt: '2026-10-29T00:00:00.000Z',
    baskets: {
      cash: { include: ['504404509311573862'] },
      bank: { include: ['504404509311573863'] },
      deposit: { include: [] },
      inTransit: { include: [] },
      fixedCost: { include: [] },
    },
  }

  it('parses valid mapping successfully', () => {
    const parsed = parseMapping(JSON.stringify(validMapping))
    expect(parsed).toEqual(validMapping)
  })

  it('returns null on invalid or broken JSON', () => {
    expect(parseMapping('{rusak')).toBeNull()
    expect(parseMapping(null)).toBeNull()
    expect(parseMapping('')).toBeNull()
    expect(parseMapping('{"version":2}')).toBeNull()
  })

  it('creates defaultMapping with sub_account_group Cash postables only', () => {
    const tree = buildCoaTree(mockCoaRows)
    const def = defaultMapping(tree, '2026-10-29T00:00:00.000Z')
    // In fixture, only 1-1100 (504404509311573862) has subAccountGroup 'Cash'
    expect(def.baskets.cash.include).toEqual(['504404509311573862'])
    expect(def.baskets.bank.include).toEqual([])
    expect(def.baskets.deposit.include).toEqual([])
    expect(def.baskets.inTransit.include).toEqual([])
    expect(def.baskets.fixedCost.include).toEqual([])
  })
})
