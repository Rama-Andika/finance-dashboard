import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa-tree'

const tree = buildCoaTree([
  { coaId: '1', parentId: '0', code: '1-1000', name: 'Cash', status: 'POSTABLE', level: 1, accountGroup: 'Liquid Assets', subAccountGroup: 'Cash', saldoNormal: 'DEBET' },
])

vi.mock('~/server/env', () => ({ env: { ociRootCodes: [], APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({
  getCachedCoaTree: async () => tree,
  getCachedPeriods: async () => [],
}))

const movementsByDate = vi.fn()
vi.mock('~/server/repo/gl.repo', () => ({
  openingBalances: async () => [],
  countOpeningRows: async () => 0,
  movementsByDate: (...a: unknown[]) => movementsByDate(...a),
}))

const { balancesAt, balancesBySegmentAt } = await import('./balance.service')
const { clearCache } = await import('~/server/cache')

const filter = {
  locationIds: 'all' as const,
  segmentDetailIds: 'all' as const,
  d1: '2026-10-01',
  asOf: '2026-10-15',
  periodIds: [],
  compare: { d1: '', asOf: '', periodIds: [] as string[] },
  today: '2026-10-15',
  entitySegmentColumn: 'segment1_id',
}

describe('balance reads', () => {
  beforeEach(() => {
    clearCache()
    movementsByDate.mockReset()
    movementsByDate.mockResolvedValue([{ coaId: '1', debet: '100.00', credit: '40.00' }])
  })

  it('Cash Position, Runway and the reconciliations share one read of the same balances', async () => {
    const input = { asOf: '2026-10-15', coaIds: ['1'], filter }
    const [a, b] = await Promise.all([balancesAt(input), balancesAt({ ...input, coaIds: ['1'] })])
    await balancesAt(input)
    expect(movementsByDate).toHaveBeenCalledTimes(1)
    expect(a.byCoa.get('1')).toBe('60.00')
    expect(b.byCoa.get('1')).toBe('60.00')
  })

  it('reads again for another date or another account list', async () => {
    await balancesAt({ asOf: '2026-10-15', coaIds: ['1'], filter })
    await balancesAt({ asOf: '2026-10-14', coaIds: ['1'], filter })
    await balancesAt({ asOf: '2026-10-15', coaIds: ['1', '2'], filter })
    expect(movementsByDate).toHaveBeenCalledTimes(3)
  })

  it('the per-entity split is cached separately from the total', async () => {
    const input = { asOf: '2026-10-15', coaIds: ['1'], filter }
    await balancesAt(input)
    await balancesBySegmentAt(input)
    await balancesBySegmentAt(input)
    expect(movementsByDate).toHaveBeenCalledTimes(2)
  })

  it('an empty account list reads nothing', async () => {
    const res = await balancesAt({ asOf: '2026-10-15', coaIds: [], filter })
    expect(res.byCoa.size).toBe(0)
    expect(movementsByDate).not.toHaveBeenCalled()
  })
})
