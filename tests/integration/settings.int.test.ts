import { describe, expect, it, afterAll } from 'vitest'
import { getMappingRow, upsertMapping, MAPPING_KEY } from '~/server/repo/settings.repo'
import { parseMapping, defaultMapping } from '~/lib/settings/mapping-schema'
import { listCoa } from '~/server/repo/coa.repo'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import type { AccountMapping } from '~/lib/finance/coa/basket-resolver'

// Tests write to their own system_main row so the real dashboard mapping is never touched.
const TEST_KEY = 'DASHBOARD_ACCOUNT_MAPPING_TEST'

describe('Settings repository & mapping integration', () => {
  afterAll(async () => {
    // Leave the test row empty so it never looks like a real mapping.
    await upsertMapping('', TEST_KEY)
  })

  it('uses a test key that differs from the real mapping key', () => {
    expect(TEST_KEY).not.toBe(MAPPING_KEY)
  })

  it('handles corrupted JSON valueprop by detecting null and returning default mapping', async () => {
    await upsertMapping('{corrupted_json_string_test', TEST_KEY)
    const row = await getMappingRow(TEST_KEY)
    expect(row).not.toBeNull()
    const parsed = parseMapping(row!.valueprop)
    expect(parsed).toBeNull()

    // When parsed is null, the application falls back to defaultMapping
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

    await upsertMapping(JSON.stringify(sampleMapping), TEST_KEY)
    const row = await getMappingRow(TEST_KEY)
    expect(row).not.toBeNull()

    const parsed = parseMapping(row!.valueprop)
    expect(parsed).toEqual(sampleMapping)
    expect(parsed?.baskets.cash.include[0]).toBe('504404509311573862')
  })
})
