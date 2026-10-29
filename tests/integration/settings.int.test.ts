import { describe, expect, it, afterAll, beforeAll } from 'vitest'
import { getMappingRow, upsertMapping } from '~/server/repo/settings.repo'
import { parseMapping, defaultMapping } from '~/lib/settings/mapping-schema'
import { listCoa } from '~/server/repo/coa.repo'
import { buildCoaTree } from '~/lib/finance/coa-tree'
import type { AccountMapping } from '~/lib/finance/basket-resolver'

describe('Settings repository & mapping integration', () => {
  let originalValueprop: string | null = null

  beforeAll(async () => {
    const row = await getMappingRow()
    originalValueprop = row?.valueprop ?? null
  })

  afterAll(async () => {
    // Restore original state
    if (originalValueprop !== null) {
      await upsertMapping(originalValueprop)
    }
  })

  it('handles corrupted JSON valueprop by detecting null and returning default mapping', async () => {
    await upsertMapping('{corrupted_json_string_test')
    const row = await getMappingRow()
    expect(row).not.toBeNull()
    const parsed = parseMapping(row!.valueprop)
    expect(parsed).toBeNull()

    // When parsed is null, application falls back to defaultMapping
    const coaRows = await listCoa()
    const tree = buildCoaTree(coaRows)
    const fallback = defaultMapping(tree, new Date().toISOString())
    expect(fallback.version).toBe(1)
    expect(Array.isArray(fallback.baskets.cash.include)).toBe(true)
  })

  it('saves valid mapping, reads back identical object, and preserves 18-digit IDs', async () => {
    const sampleMapping: AccountMapping = {
      version: 1,
      updatedAt: '2026-10-29T05:00:00.000Z',
      baskets: {
        cash: { include: ['504404509311573862', '504404509311573863'] },
        bank: { include: ['504404509311573864'] },
        deposit: { include: [] },
        inTransit: { include: [] },
        fixedCost: { include: [] },
      },
    }

    await upsertMapping(JSON.stringify(sampleMapping))
    const row = await getMappingRow()
    expect(row).not.toBeNull()

    const parsed = parseMapping(row!.valueprop)
    expect(parsed).toEqual(sampleMapping)
    expect(parsed?.baskets.cash.include[0]).toBe('504404509311573862')
  })
})
