import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import type { AppContextFilter } from '~/server/context'
import type { DrillContext } from './shared'

const journalLines = vi.fn()
vi.mock('~/server/repo/gl.repo', () => ({
  journalLines: (...a: unknown[]) => journalLines(...a),
  journalHeaders: async () => [],
  movementsByPeriods: async () => [],
}))
vi.mock('~/server/db/gl-tables', () => ({ tablesBetween: () => ['gl'] }))
vi.mock('~/server/repo/payment-plan.repo', () => ({ listPlanStatuses: async () => [] }))
vi.mock('~/server/services/cash-flow.service', () => ({}))
vi.mock('~/server/context', () => ({}))

const { journalRows } = await import('./shared')

const entities = [
  { locationId: 'locA', code: 'A', name: 'Store A', isActive: true, segmentDetailIds: ['sA1', 'sA2'] },
  { locationId: 'locB', code: 'B', name: 'Store B', isActive: true, segmentDetailIds: ['sB'] },
]

const filter: AppContextFilter = {
  locationIds: 'all',
  segmentDetailIds: 'all',
  d1: '2026-10-01',
  asOf: '2026-10-15',
  periodIds: [],
  compare: { d1: '', asOf: '', periodIds: [] },
  today: '2026-10-15',
  entitySegmentColumn: 'segment1_id',
  entityCount: 2,
  hasOpenPeriod: true,
  months: ['2026-10'],
  missingMonths: [],
}

const ctx: DrillContext = { filter, tree: buildCoaTree([]), periods: [], activePeriods: [], entities, offset: 0 }
const range = { from: '2026-10-01', to: '2026-10-15' }

const line = (glId: string, coaId: string, segmentDetailId: string) => ({
  glId,
  journalNumber: `J${glId}`,
  transDate: '2026-10-01',
  journalType: 1,
  memo: '',
  coaId,
  debet: '10.00',
  credit: '0.00',
  segmentDetailId,
})

describe('journalRows: entity of every line', () => {
  beforeEach(() => {
    journalLines.mockReset()
  })

  it('splits the lines per entity and names the owner when several entities are in scope', async () => {
    journalLines.mockResolvedValue([line('1', '10', 'sA1'), line('1', '10', 'sB'), line('2', '10', '0')])
    const res = await journalRows(ctx, ['10'], 'all', 'Cash', range)
    expect(journalLines).toHaveBeenCalledWith(expect.objectContaining({ bySegment: true }))
    expect(res.showEntity).toBe(true)
    expect(res.rows.map((r) => r.entityName)).toEqual(['Store A', 'Store B', null])
    expect(res.rows.map((r) => r.id)).toEqual(['1-10-sA1', '1-10-sB', '2-10-0'])
  })

  it('also names the owner when a subset of two entities is selected', async () => {
    journalLines.mockResolvedValue([line('1', '10', 'sA2')])
    const res = await journalRows(ctx, ['10'], ['sA1', 'sB'], 'Cash', range)
    expect(journalLines).toHaveBeenCalledWith(expect.objectContaining({ bySegment: true }))
    expect(res.showEntity).toBe(true)
    expect(res.rows[0]?.entityName).toBe('Store A')
  })

  it('leaves the lines and their ids as they were when only one entity is in scope', async () => {
    journalLines.mockResolvedValue([line('1', '10', '')])
    const res = await journalRows(ctx, ['10'], ['sA1', 'sA2'], 'Cash', range)
    expect(journalLines).toHaveBeenCalledWith(expect.objectContaining({ bySegment: false }))
    expect(res.showEntity).toBe(false)
    expect(res.rows[0]).not.toHaveProperty('entityName')
    expect(res.rows[0]?.id).toBe('1-10')
  })
})
