import { beforeEach, describe, expect, it, vi } from 'vitest'
import { balanceSheetCoaRows, regularPeriod } from 'tests/fixtures/balance-sheet.fixture'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import type { Id, Money, Period } from '~/lib/core/types'

const tree = buildCoaTree(balanceSheetCoaRows)

let periods: Period[] = []
vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-05-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({
  getCachedCoaTree: async () => tree,
  getCachedPeriods: async () => periods,
  buildMetricMeta: () => ({}),
}))

type MoveRow = { coaId: Id; periodId: Id; debet: Money; credit: Money }
let movementRows: MoveRow[] = []
let openingRowsByPeriod: Record<Id, Array<{ coaId: Id; opening: Money }>> = {}
const movementsByPeriods = vi.fn(async (opts: { periods: Period[] }) => {
  const wanted = new Set(opts.periods.map((p) => p.periodeId))
  return movementRows.filter((r) => wanted.has(r.periodId))
})
vi.mock('~/server/repo/gl/gl.repo', () => ({
  movementsByPeriods: (opts: { periods: Period[] }) => movementsByPeriods(opts),
  openingBalances: async (opts: { periodeId: Id }) => openingRowsByPeriod[opts.periodeId] ?? [],
  countOpeningRows: async (periodeId: Id) => (openingRowsByPeriod[periodeId] ?? []).length,
}))
vi.mock('~/server/repo/master-data/company.repo', () => ({ readFiscalEndMonthRaw: async () => 11 }))
vi.mock('~/server/repo/master-data/system-property.repo', () => ({
  readSystemProperties: async () =>
    new Map([
      ['CODE_LABA_TAHUN_BERJALAN', '33'],
      ['CODE_LABA_TAHUN_LALU', '32'],
    ]),
}))

let builtPeriods = new Map<Id, string>()
let savedTotals = new Map<Id, Record<string, Money>>()
const snapshotBalanceTotals = vi.fn(
  async (ids: Id[], _segIds: unknown) =>
    new Map(ids.flatMap((id) => (savedTotals.has(id) ? [[id, savedTotals.get(id)!]] : []))),
)
vi.mock('~/server/dash/balance-snapshot-read', () => ({
  builtBalancePeriods: async () => builtPeriods,
  snapshotBalanceTotals: (ids: Id[], segIds: unknown) => snapshotBalanceTotals(ids, segIds),
}))

const { computeBalanceTrend } = await import('./balance-trend.service')
const { clearCache } = await import('~/server/cache')

const filter = {
  locationIds: 'all' as const,
  segmentDetailIds: 'all' as const,
  d1: '2026-05-01',
  asOf: '2026-05-15',
  periodIds: ['r2026-05'],
  compare: { d1: '', asOf: '', periodIds: [] as string[] },
  today: '2026-05-15',
  entitySegmentColumn: 'segment1_id',
  entityCount: 1,
  hasOpenPeriod: true,
  months: ['2026-05'],
  missingMonths: [] as string[],
}

const month = (periodId: Id, sales: string, rent: string): MoveRow[] => [
  { coaId: 'cash', periodId, debet: sales, credit: rent },
  { coaId: 'sales', periodId, debet: '0.00', credit: sales },
  { coaId: 'rent', periodId, debet: rent, credit: '0.00' },
]

beforeEach(() => {
  clearCache()
  movementsByPeriods.mockClear()
  snapshotBalanceTotals.mockClear()
  // Closed up to February; March and April are Pre Closed, May is Open.
  periods = [
    regularPeriod('2026-01'),
    regularPeriod('2026-02'),
    regularPeriod('2026-03', 'Pre Closed'),
    regularPeriod('2026-04', 'Pre Closed'),
    regularPeriod('2026-05', 'Open'),
  ]
  movementRows = [
    ...month('r2026-01', '100.00', '70.00'),
    ...month('r2026-02', '80.00', '60.00'),
    ...month('r2026-03', '50.00', '40.00'),
    ...month('r2026-04', '30.00', '20.00'),
    ...month('r2026-05', '20.00', '5.00'),
  ]
  // The saved opening balances of March (the period after the last Closed one).
  openingRowsByPeriod = {
    'r2026-03': [
      { coaId: 'cash', opening: '240.00' },
      { coaId: 'capital', opening: '150.00' },
      { coaId: 'prior', opening: '40.00' },
      { coaId: 'current', opening: '50.00' },
    ],
  }
  builtPeriods = new Map()
  savedTotals = new Map()
})

describe('computeBalanceTrend', () => {
  it('shows the months that can be reached from the opening balances, marked as not closed', async () => {
    const result = await computeBalanceTrend(filter)
    expect(result.points.map((p) => [p.monthKey, p.assets, p.equity, p.provisional, p.source])).toEqual([
      ['2026-03', '250.00', '250.00', true, 'live'],
      ['2026-04', '260.00', '260.00', true, 'live'],
      ['2026-05', '275.00', '275.00', true, 'live'],
    ])
    // January and February are Closed but not saved yet, and lie before the opening balances: two months are missing.
    expect(result.missingCount).toBe(2)
  })

  it('takes a Closed month with saved totals from the snapshot, without reading its journals again', async () => {
    builtPeriods = new Map([['r2026-02', 'v1']])
    savedTotals = new Map([['r2026-02', { 'Liquid Assets': '230.00', Equity: '220.00', Profit: '10.00' }]])
    const result = await computeBalanceTrend(filter)
    const feb = result.points.find((p) => p.monthKey === '2026-02')
    expect(feb).toMatchObject({
      assets: '230.00',
      liabilities: '0.00',
      equity: '230.00',
      provisional: false,
      source: 'snapshot',
    })
    expect(snapshotBalanceTotals).toHaveBeenCalledTimes(1)
    expect(snapshotBalanceTotals.mock.calls[0]?.[0]).toEqual(['r2026-02'])
    expect(result.missingCount).toBe(1)
  })

  it('never takes the report month from the snapshot, so it agrees with the table', async () => {
    builtPeriods = new Map([['r2026-05', 'v1']])
    savedTotals = new Map([['r2026-05', { 'Liquid Assets': '1.00' }]])
    periods = periods.map((p) => (p.periodeId === 'r2026-05' ? { ...p, status: 'Closed' as const } : p))
    const result = await computeBalanceTrend(filter)
    expect(result.points.at(-1)).toMatchObject({ monthKey: '2026-05', assets: '275.00', source: 'live' })
  })

  it('has no points when the end month of the filter has no period', async () => {
    const result = await computeBalanceTrend({ ...filter, asOf: '2026-12-15', periodIds: [] })
    expect(result).toEqual({ points: [], missingCount: 0 })
    expect(movementsByPeriods).not.toHaveBeenCalled()
  })

  it('answers a second call for the same filter from the cache', async () => {
    await computeBalanceTrend(filter)
    await computeBalanceTrend(filter)
    expect(movementsByPeriods).toHaveBeenCalledTimes(1)
  })
})
