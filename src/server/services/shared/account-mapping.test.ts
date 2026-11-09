import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'

const getMappingRow = vi.fn()
vi.mock('~/server/repo/settings.repo', () => ({ getMappingRow: (...a: unknown[]) => getMappingRow(...a) }))

const { loadAccountMapping, loadMappingState } = await import('./account-mapping')
const { loadResolvedBaskets } = await import('./resolved-baskets')
const { clearCache } = await import('~/server/cache')

const cashAccount = {
  coaId: '10',
  parentId: '0',
  code: '1-1000',
  name: 'Cash',
  status: 'POSTABLE' as const,
  level: 1,
  accountGroup: 'Liquid Assets' as const,
  subAccountGroup: 'Cash',
  saldoNormal: 'DEBET' as const,
}
const bankAccount = { ...cashAccount, coaId: '11', code: '1-1100', name: 'Bank', subAccountGroup: 'Bank' }

const mappingText = (bankIds: string[]) =>
  JSON.stringify({
    version: 1,
    updatedAt: '2026-11-01T00:00:00.000Z',
    baskets: {
      cash: { include: ['10'] },
      bank: { include: bankIds },
      deposit: { include: [] },
      inTransit: { include: [] },
      fixedCost: { include: [] },
    },
  })

describe('account mapping and resolved baskets', () => {
  beforeEach(() => {
    clearCache()
    getMappingRow.mockReset()
  })

  it('parses the stored text once and hands every caller the same objects', async () => {
    getMappingRow.mockResolvedValue({ sysmainId: '1', valueprop: mappingText(['11']) })
    const tree = buildCoaTree([cashAccount, bankAccount])

    const first = await loadMappingState(tree)
    const second = await loadMappingState(tree)
    expect(second).toBe(first)
    expect(first.isDefault).toBe(false)

    const baskets = await loadResolvedBaskets(tree)
    expect(await loadResolvedBaskets(tree)).toBe(baskets)
    expect(baskets.cash).toEqual(['10'])
    expect(baskets.bank).toEqual(['11'])
    expect(getMappingRow).toHaveBeenCalledTimes(1)
  })

  it('builds the answer again for a new chart of accounts', async () => {
    getMappingRow.mockResolvedValue({ sysmainId: '1', valueprop: mappingText(['11']) })
    const first = await loadResolvedBaskets(buildCoaTree([cashAccount, bankAccount]))
    const second = await loadResolvedBaskets(buildCoaTree([cashAccount]))
    expect(second).not.toBe(first)
    expect(first.bank).toEqual(['11'])
    expect(second.bank).toEqual([]) // account 11 is not in the new chart: it is reported as missing
    expect(second.missing).toEqual(['11'])
  })

  it('builds the answer again when the stored text changes', async () => {
    const tree = buildCoaTree([cashAccount, bankAccount])
    getMappingRow.mockResolvedValue({ sysmainId: '1', valueprop: mappingText(['11']) })
    const before = await loadResolvedBaskets(tree)

    clearCache('mapping:') // what saving the mapping does
    getMappingRow.mockResolvedValue({ sysmainId: '1', valueprop: mappingText([]) })
    const after = await loadResolvedBaskets(tree)

    expect(after).not.toBe(before)
    expect(before.bank).toEqual(['11'])
    expect(after.bank).toEqual([])
  })

  it('uses the default mapping when nothing is stored, and flags text that cannot be read', async () => {
    const tree = buildCoaTree([cashAccount, bankAccount])
    getMappingRow.mockResolvedValue(null)
    const empty = await loadMappingState(tree)
    expect(empty.isDefault).toBe(true)
    expect(empty.mapping.baskets.cash.include).toEqual(['10'])

    clearCache('mapping:')
    getMappingRow.mockResolvedValue({ sysmainId: '1', valueprop: '{not json' })
    const broken = await loadMappingState(tree)
    expect(broken.corrupted).toBe(true)
    expect((await loadAccountMapping(tree)).baskets.cash.include).toEqual(['10'])
  })
})
