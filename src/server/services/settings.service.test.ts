import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'

const tree = buildCoaTree([
  {
    coaId: '10',
    parentId: '0',
    code: '1-1000',
    name: 'Cash',
    status: 'POSTABLE',
    level: 1,
    accountGroup: 'Liquid Assets',
    subAccountGroup: 'Cash',
    saldoNormal: 'DEBET',
  },
])

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({ getCachedCoaTree: async () => tree }))
vi.mock('~/server/repo/master-data/coa.repo', () => ({
  listCoa: async () => [
    {
      coaId: '10',
      parentId: '0',
      code: '1-1000',
      name: 'Cash',
      status: 'POSTABLE',
      level: 1,
      accountGroup: 'Liquid Assets',
      subAccountGroup: 'Cash',
      saldoNormal: 'DEBET',
    },
  ],
}))
const upsertMapping = vi.fn()
vi.mock('~/server/repo/settings.repo', () => ({
  getMappingRow: async () => null,
  upsertMapping: (...a: unknown[]) => upsertMapping(...a),
}))
vi.mock('~/server/services/cash/balance.service', () => ({ balancesAt: async () => ({ byCoa: new Map() }) }))

const { saveAccountMapping } = await import('./settings.service')
const { clearCache, glMovementsCache, memo, memoMetric } = await import('~/server/cache')

const input = {
  version: 1 as const,
  updatedAt: '2026-11-01T00:00:00.000Z',
  baskets: {
    cash: { include: ['10'] },
    bank: { include: [] },
    deposit: { include: [] },
    inTransit: { include: [] },
    fixedCost: { include: [] },
  },
}

describe('saveAccountMapping: what is forgotten after a save', () => {
  beforeEach(() => {
    clearCache()
    upsertMapping.mockReset()
    upsertMapping.mockResolvedValue('1')
  })

  it('forgets the stored mapping and the computed metrics, and keeps the reads that are keyed by account ids', async () => {
    const mappingRow = vi.fn(async () => 'row')
    const metric = vi.fn(async () => 'metric')
    const balances = vi.fn(async () => 'balances')
    await memo('mapping:row', 60_000, mappingRow)
    await memoMetric('revenue', { a: 1 }, metric)
    await memo('balances|2026-10-15|segment1_id|all|abc', 60_000, balances)
    glMovementsCache.set('mv|gl|p1|Closed|v:erp|segment1_id|all|abc|loc:false|g:', [
      { coaId: '1', periodId: 'p1', debet: '1.00', credit: '0.00' },
    ])

    const result = await saveAccountMapping(input)
    expect(result.ok).toBe(true)
    expect(upsertMapping).toHaveBeenCalledTimes(1)

    await memo('mapping:row', 60_000, mappingRow)
    await memoMetric('revenue', { a: 1 }, metric)
    await memo('balances|2026-10-15|segment1_id|all|abc', 60_000, balances)
    expect(mappingRow).toHaveBeenCalledTimes(2) // read again
    expect(metric).toHaveBeenCalledTimes(2) // computed again
    expect(balances).toHaveBeenCalledTimes(1) // still cached
    expect(glMovementsCache.get('mv|gl|p1|Closed|v:erp|segment1_id|all|abc|loc:false|g:')).toBeDefined()
  })

  it('changes nothing when the mapping has a blocking problem', async () => {
    const metric = vi.fn(async () => 'metric')
    await memoMetric('revenue', { a: 1 }, metric)

    const conflicting = { ...input, baskets: { ...input.baskets, bank: { include: ['10'] } } }
    const result = await saveAccountMapping(conflicting)
    expect(result.ok).toBe(false)
    expect(upsertMapping).not.toHaveBeenCalled()

    await memoMetric('revenue', { a: 1 }, metric)
    expect(metric).toHaveBeenCalledTimes(1)
  })
})
