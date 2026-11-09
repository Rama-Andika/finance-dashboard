import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import type { AppContextFilter } from '~/server/context'
import type { DrillContext } from './shared'

const journalLines = vi.fn()
const journalHeaders = vi.fn()
vi.mock('~/server/repo/gl/gl.repo', () => ({
  journalLines: (...a: unknown[]) => journalLines(...a),
  journalHeaders: (...a: unknown[]) => journalHeaders(...a),
  movementsByPeriods: async () => [],
}))
vi.mock('~/server/db/gl-tables', () => ({ tablesBetween: () => ['gl'] }))
vi.mock('~/server/repo/ap-ar/payment-plan.repo', () => ({ listPlanStatuses: async () => [] }))
vi.mock('~/server/services/cash/cash-flow.service', () => ({}))
vi.mock('~/server/context', () => ({}))

const { journalRows, portionJournalRows } = await import('./shared')

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

describe('portionJournalRows: newest journals first, over all pages', () => {
  const portion = (glId: string, amount: string) =>
    ({
      glId,
      journalType: 1,
      periodId: 'p1',
      counterCoaId: '10',
      portion: amount,
      drawer: 'OPERATING',
      subGroup: 'x',
    }) as never
  const header = (glId: string, transDate: string) => ({
    glId,
    journalNumber: `J${glId}`,
    transDate,
    journalType: 1,
    memo: '',
  })

  beforeEach(() => {
    journalHeaders.mockReset()
  })

  it('orders by date over all journals before it cuts the page, so no page holds a newer date than the page before', async () => {
    // 205 journals that arrive in id order, while the dates repeat every 28 ids: the id order is not the date order
    const ids = Array.from({ length: 205 }, (_, n) => String(1000 + n))
    const dateOf = (id: string) => `2026-01-${String(((Number(id) - 1000) % 28) + 1).padStart(2, '0')}`
    journalHeaders.mockImplementation(async () => ids.map((id) => header(id, dateOf(id))))
    const portions = ids.map((id) => portion(id, '1.00'))

    const first = await portionJournalRows(ctx, portions, 'Leaf', 1)
    const second = await portionJournalRows({ ...ctx, offset: 200 }, portions, 'Leaf', 1)

    expect(first.rows).toHaveLength(200)
    expect(first.hasMore).toBe(true)
    expect(second.rows).toHaveLength(5)
    expect(second.hasMore).toBe(false)
    const firstDates = first.rows.map((r) => r.transDate as string)
    const secondDates = second.rows.map((r) => r.transDate as string)
    expect([...firstDates].sort().reverse()).toEqual(firstDates) // newest first inside the page
    expect(Math.min(...firstDates.map((d) => Date.parse(d)))).toBeGreaterThanOrEqual(
      Math.max(...secondDates.map((d) => Date.parse(d))),
    ) // and nothing on page 2 is newer than anything on page 1
    expect(journalHeaders).toHaveBeenCalledWith(expect.objectContaining({ glIds: ids }))
  })

  it('breaks a tie of dates by the higher journal id first, comparing ids as numbers', async () => {
    journalHeaders.mockResolvedValue([
      header('9', '2026-10-01'),
      header('10', '2026-10-01'),
      header('100', '2026-10-01'),
    ])
    const res = await portionJournalRows(
      ctx,
      [portion('9', '1.00'), portion('10', '1.00'), portion('100', '1.00')],
      'Leaf',
      1,
    )
    expect(res.rows.map((r) => r.id)).toEqual(['100', '10', '9'])
  })

  it('adds up the portions of one journal and applies the sign', async () => {
    journalHeaders.mockResolvedValue([header('5', '2026-10-01')])
    const res = await portionJournalRows(ctx, [portion('5', '-40.00'), portion('5', '-10.50')], 'Leaf', -1)
    expect(res.rows).toEqual([{ id: '5', docNumber: 'J5', transDate: '2026-10-01', memo: '', amount: '50.50' }])
  })

  it('falls back to the journal id and an empty date when a header is missing', async () => {
    journalHeaders.mockResolvedValue([])
    const res = await portionJournalRows(ctx, [portion('7', '2.00')], 'Leaf', 1)
    expect(res.rows).toEqual([{ id: '7', docNumber: '7', transDate: null, memo: '', amount: '2.00' }])
  })
})
