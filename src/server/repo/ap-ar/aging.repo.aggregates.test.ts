import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/server/db/query', () => ({ rows: vi.fn() }))
const covers = vi.fn()
vi.mock('~/server/dash/snapshot', () => ({
  apArSnapshotCovers: (...args: unknown[]) => covers(...args),
  snapshotOpenInvoices: vi.fn(),
  snapshotUnallocated: vi.fn(),
}))
const histCovers = vi.fn()
vi.mock('~/server/dash/snapshot-hist', () => ({
  apArHistCovers: (...args: unknown[]) => histCovers(...args),
  histOpenInvoices: vi.fn(),
  histUnallocated: vi.fn(),
}))
const snapshotAggregates = vi.fn()
const histAggregates = vi.fn()
const snapshotTotals = vi.fn()
const histTotals = vi.fn()
vi.mock('~/server/dash/snapshot-aggregate', () => ({
  snapshotAgingAggregates: (...args: unknown[]) => snapshotAggregates(...args),
  histAgingAggregates: (...args: unknown[]) => histAggregates(...args),
  snapshotDueTotals: (...args: unknown[]) => snapshotTotals(...args),
  histDueTotals: (...args: unknown[]) => histTotals(...args),
}))

const { agingAggregates, agingDueTotals } = await import('./aging.repo')

describe('agingAggregates', () => {
  beforeEach(() => {
    for (const m of [covers, histCovers, snapshotAggregates, histAggregates]) m.mockReset()
    covers.mockResolvedValue(false)
    histCovers.mockResolvedValue(false)
    snapshotAggregates.mockResolvedValue({ items: [], payments: [], coaIds: ['s'] })
    histAggregates.mockResolvedValue({ items: [], payments: [], coaIds: ['h'] })
  })

  it("answers from today's snapshot when it covers the date", async () => {
    covers.mockResolvedValue(true)
    expect((await agingAggregates('ap', '2026-06-15', 'all'))?.coaIds).toEqual(['s'])
    expect(snapshotAggregates).toHaveBeenCalledWith('ap', '2026-06-15', 'all')
    expect(histAggregates).not.toHaveBeenCalled()
  })

  it('answers from the month-end history when only that covers the date', async () => {
    histCovers.mockResolvedValue(true)
    expect((await agingAggregates('ar', '2026-05-31', ['1']))?.coaIds).toEqual(['h'])
    expect(histAggregates).toHaveBeenCalledWith('ar', '2026-05-31', ['1'])
  })

  it('is null when neither covers the date, and empty without locations', async () => {
    expect(await agingAggregates('ap', '2025-01-01', 'all')).toBeNull()
    expect(await agingAggregates('ap', '2025-01-01', [])).toEqual({
      items: [],
      payments: [],
      coaIds: [],
    })
    expect(covers).toHaveBeenCalledTimes(1) // the empty location list asked nothing
  })
})

describe('agingDueTotals', () => {
  beforeEach(() => {
    for (const m of [covers, histCovers, snapshotTotals, histTotals]) m.mockReset()
    covers.mockResolvedValue(false)
    histCovers.mockResolvedValue(false)
    snapshotTotals.mockResolvedValue(new Map([['2026-06-15', '1.00']]))
    histTotals.mockResolvedValue(new Map([['2026-05-31', '2.00']]))
  })

  it('routes like the aging figures and is null when nothing covers the date', async () => {
    const opts = { maxDue: '2026-06-21' }
    expect(await agingDueTotals('ap', '2026-06-15', 'all', opts)).toBeNull()
    covers.mockResolvedValue(true)
    expect((await agingDueTotals('ap', '2026-06-15', 'all', opts))?.get('2026-06-15')).toBe('1.00')
    covers.mockResolvedValue(false)
    histCovers.mockResolvedValue(true)
    expect((await agingDueTotals('ap', '2026-05-31', 'all', opts))?.get('2026-05-31')).toBe('2.00')
    expect((await agingDueTotals('ap', '2026-05-31', [], opts))?.size).toBe(0)
  })
})
