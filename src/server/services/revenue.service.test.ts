import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'

const tree = buildCoaTree([
  { coaId: '41', parentId: '0', code: '4-1000', name: 'Sales', status: 'POSTABLE', level: 1, accountGroup: 'Revenue', subAccountGroup: '', saldoNormal: 'CREDIT' },
])
const entities = [
  { locationId: 'locA', code: 'A', name: 'Store A', isActive: true, segmentDetailIds: ['sA'] },
  { locationId: 'locB', code: 'B', name: 'Store B', isActive: true, segmentDetailIds: ['sB'] },
]

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({
  getCachedCoaTree: async () => tree,
  getCachedPeriods: async () => [
    { periodeId: 'p1', name: 'Oct', startDate: '2026-10-01', endDate: '2026-10-31', status: 'Open', type: 0, tableName: 'gl' },
  ],
  getCachedEntities: async () => ({ segment: { segmentId: 's', columnName: 'segment1_id' }, entities }),
  buildMetricMeta: () => ({}),
}))

const movementsByPeriods = vi.fn()
vi.mock('~/server/repo/gl.repo', () => ({
  movementsByPeriods: (...a: unknown[]) => movementsByPeriods(...a),
}))
vi.mock('~/server/services/shared/pl-movements', () => ({
  loadPlMovements: async () => [],
  onlyAccounts: (rows: unknown[]) => rows,
}))

const { computeRevenue } = await import('./revenue.service')
const { clearCache } = await import('~/server/cache')

const filter = {
  locationIds: 'all' as const,
  segmentDetailIds: 'all' as const,
  d1: '2026-10-01',
  asOf: '2026-10-15',
  periodIds: ['p1'],
  compare: { d1: '', asOf: '', periodIds: [] as string[] },
  today: '2026-10-15',
  entitySegmentColumn: 'segment1_id',
  entityCount: 2,
  hasOpenPeriod: true,
  months: ['2026-10'],
  missingMonths: [] as string[],
}

const row = (locationId: string | undefined, credit: string) => ({
  coaId: '41', periodId: 'p1', locationId, debet: '0.00', credit,
})

describe('computeRevenue: per-entity split', () => {
  beforeEach(() => {
    clearCache()
    movementsByPeriods.mockReset()
  })

  it('gives every entity row its location id', async () => {
    movementsByPeriods.mockResolvedValue([row('locA', '100.00'), row('locB', '50.00')])
    const res = await computeRevenue(filter)
    expect(res.byEntity).toEqual([
      { id: 'locA', code: 'A', name: 'Store A', amount: '100.00' },
      { id: 'locB', code: 'B', name: 'Store B', amount: '50.00' },
    ])
  })

  it('puts revenue without a location in entityUnassigned and the total stays whole', async () => {
    movementsByPeriods.mockResolvedValue([row('locA', '100.00'), row('locB', '50.00'), row(undefined, '30.00')])
    const res = await computeRevenue(filter)
    expect(res.total).toBe('180.00')
    expect(res.entityUnassigned).toBe('30.00')
  })

  it('counts revenue of a location outside the entity list as unassigned too', async () => {
    movementsByPeriods.mockResolvedValue([row('locA', '100.00'), row('locZ', '20.00'), row(undefined, '30.00')])
    const res = await computeRevenue(filter)
    expect(res.total).toBe('150.00')
    expect(res.entityUnassigned).toBe('50.00')
  })

  it('has nothing unassigned when every line has a known location', async () => {
    movementsByPeriods.mockResolvedValue([row('locA', '100.00'), row('locB', '50.00')])
    const res = await computeRevenue(filter)
    expect(res.entityUnassigned).toBe('0.00')
  })

  it('keeps only the selected entities in byEntity', async () => {
    movementsByPeriods.mockResolvedValue([row('locA', '100.00')])
    const res = await computeRevenue({ ...filter, locationIds: ['locA'], segmentDetailIds: ['sA'] })
    expect(res.byEntity.map((e) => e.id)).toEqual(['locA'])
    expect(res.entityUnassigned).toBe('0.00')
  })

  it('returns an empty split when no period is selected, without reading the GL', async () => {
    const res = await computeRevenue({ ...filter, periodIds: [] })
    expect(res.byEntity).toEqual([])
    expect(res.entityUnassigned).toBe('0.00')
    expect(movementsByPeriods).not.toHaveBeenCalled()
  })
})
