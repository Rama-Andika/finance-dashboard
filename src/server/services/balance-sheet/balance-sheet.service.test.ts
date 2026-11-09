import { beforeEach, describe, expect, it, vi } from 'vitest'
import { balanceSheetCoaRows, regularPeriod } from 'tests/fixtures/balance-sheet.fixture'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import type { Id, Money, Period } from '~/lib/core/types'

const tree = buildCoaTree(balanceSheetCoaRows)

let periods: Period[] = []
vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-03-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({
  getCachedCoaTree: async () => tree,
  getCachedPeriods: async () => periods,
  buildMetricMeta: () => ({
    readAt: 'now',
    d1: '',
    asOf: '',
    today: '',
    entityCount: 1,
    isAllEntities: true,
    hasOpenPeriod: false,
    missingMonths: [],
  }),
}))

type MoveRow = { coaId: Id; periodId: Id; debet: Money; credit: Money }
let movementRows: MoveRow[] = []
let openingRowsByPeriod: Record<Id, Array<{ coaId: Id; opening: Money }>> = {}

const movementsByPeriods = vi.fn(async (opts: { periods: Period[] }) => {
  const wanted = new Set(opts.periods.map((p) => p.periodeId))
  return movementRows.filter((r) => wanted.has(r.periodId))
})
const openingBalances = vi.fn(async (opts: { periodeId: Id }) => openingRowsByPeriod[opts.periodeId] ?? [])
const countOpeningRows = vi.fn(async (periodeId: Id) => (openingRowsByPeriod[periodeId] ?? []).length)
vi.mock('~/server/repo/gl/gl.repo', () => ({
  movementsByPeriods: (opts: { periods: Period[] }) => movementsByPeriods(opts),
  openingBalances: (opts: { periodeId: Id }) => openingBalances(opts),
  countOpeningRows: (periodeId: Id) => countOpeningRows(periodeId),
}))

let fiscalRaw: number | string | null = 11
vi.mock('~/server/repo/master-data/company.repo', () => ({ readFiscalEndMonthRaw: async () => fiscalRaw }))

let properties = new Map<string, string>()
vi.mock('~/server/repo/master-data/system-property.repo', () => ({ readSystemProperties: async () => properties }))

const { computeBalanceSheet } = await import('./balance-sheet.service')
const { clearCache } = await import('~/server/cache')

const filter = {
  locationIds: 'all' as const,
  segmentDetailIds: 'all' as const,
  d1: '2026-03-01',
  asOf: '2026-03-15',
  periodIds: ['r2026-03'],
  compare: { d1: '', asOf: '', periodIds: [] as string[] },
  today: '2026-03-15',
  entitySegmentColumn: 'segment1_id',
  entityCount: 1,
  hasOpenPeriod: true,
  months: ['2026-03'],
  missingMonths: [] as string[],
}

/** Cash sales and cash rent of one month. */
const month = (periodId: Id, sales: string, rent: string): MoveRow[] => [
  { coaId: 'cash', periodId, debet: sales, credit: rent },
  { coaId: 'sales', periodId, debet: '0.00', credit: sales },
  { coaId: 'rent', periodId, debet: rent, credit: '0.00' },
]

beforeEach(() => {
  clearCache()
  movementsByPeriods.mockClear()
  openingBalances.mockClear()
  countOpeningRows.mockClear()
  fiscalRaw = 11
  properties = new Map([
    ['CODE_LABA_TAHUN_BERJALAN', '33'],
    ['CODE_LABA_TAHUN_LALU', '32'],
  ])
  // January and February are Closed, March is Open.
  periods = [regularPeriod('2026-01'), regularPeriod('2026-02'), regularPeriod('2026-03', 'Open')]
  movementRows = [
    ...month('r2026-01', '100.00', '70.00'),
    ...month('r2026-02', '80.00', '60.00'),
    ...month('r2026-03', '50.00', '40.00'),
  ]
  // The saved opening balances of March: cash 240, capital 150, prior earnings 40, current earnings 50 (Jan + Feb).
  openingRowsByPeriod = {
    'r2026-03': [
      { coaId: 'cash', opening: '240.00' },
      { coaId: 'capital', opening: '150.00' },
      { coaId: 'prior', opening: '40.00' },
      { coaId: 'current', opening: '50.00' },
    ],
  }
})

describe('computeBalanceSheet', () => {
  it('reports March from its saved opening balances, balanced, and marks it as not closed', async () => {
    const result = await computeBalanceSheet(filter, 'none')
    expect(result.status).toBe('ok')
    expect(result.period).toMatchObject({ id: 'r2026-03', status: 'Open', reportDate: '2026-03-15' })
    expect(result.method).toBe('opening-table')
    expect(result.openingPeriodName).toBe('2026-03')
    expect(result.provisional).toBe(true)
    expect(result.meta.hasOpenPeriod).toBe(true)
    expect(result.unclosedCount).toBe(1)
    expect(result.statement.totals).toEqual({
      assets: '250.00',
      liabilities: '0.00',
      equity: '250.00',
      liabilitiesEquity: '250.00',
      difference: '0.00',
    })
    expect(result.earnings).toMatchObject({
      used: 'A',
      current: '60.00',
      methodA: '60.00',
      methodB: '60.00',
      difference: '0.00',
      currentAccountFound: true,
      priorAccountFound: true,
    })
    expect(result.compare).toBeNull()
  })

  it('reads the opening balances of March and the journals of the whole fiscal year, once each', async () => {
    await computeBalanceSheet(filter, 'none')
    expect(openingBalances).toHaveBeenCalledTimes(1)
    expect(openingBalances.mock.calls[0]?.[0]).toMatchObject({
      periodeId: 'r2026-03',
      segCol: 'segment1_id',
      segIds: 'all',
    })
    expect(movementsByPeriods).toHaveBeenCalledTimes(1)
    const asked = movementsByPeriods.mock.calls[0]![0].periods.map((p) => p.periodeId)
    expect(asked).toEqual(['r2026-01', 'r2026-02', 'r2026-03'])
  })

  it('answers a second call for the same filter from the cache', async () => {
    await computeBalanceSheet(filter, 'none')
    await computeBalanceSheet(filter, 'none')
    expect(movementsByPeriods).toHaveBeenCalledTimes(1)
  })

  it('falls back to the whole history when the opening period has no saved opening balances', async () => {
    openingRowsByPeriod = {}
    movementRows = [
      { coaId: 'cash', periodId: 'r2026-01', debet: '190.00', credit: '0.00' },
      { coaId: 'capital', periodId: 'r2026-01', debet: '0.00', credit: '150.00' },
      { coaId: 'prior', periodId: 'r2026-01', debet: '0.00', credit: '40.00' },
      ...movementRows,
    ]
    const result = await computeBalanceSheet(filter, 'none')
    expect(result.method).toBe('full-history')
    expect(result.openingPeriodName).toBeNull()
    expect(openingBalances).not.toHaveBeenCalled()
    expect(result.earnings?.used).toBe('B')
    expect(result.statement.totals).toMatchObject({ assets: '250.00', difference: '0.00' })
  })

  it('reports a difference when the ERP opening balance of the earnings account is wrong', async () => {
    openingRowsByPeriod['r2026-03'] = [
      { coaId: 'cash', opening: '240.00' },
      { coaId: 'capital', opening: '150.00' },
      { coaId: 'prior', opening: '40.00' },
      { coaId: 'current', opening: '45.00' },
    ]
    const result = await computeBalanceSheet(filter, 'none')
    expect(result.earnings?.difference).toBe('-5.00')
    expect(result.statement.totals.difference).toBe('5.00')
  })

  it('has no period to report when the end month of the filter has no period', async () => {
    const result = await computeBalanceSheet({ ...filter, asOf: '2026-09-15', periodIds: [] }, 'year-end')
    expect(result.status).toBe('no-period')
    expect(result.period).toBeNull()
    expect(result.statement.assets.nodes).toEqual([])
    expect(result.statement.totals.difference).toBe('0.00')
    expect(movementsByPeriods).not.toHaveBeenCalled()
  })

  it("compares with the end of the previous fiscal year, using that period's own opening balances", async () => {
    periods = [regularPeriod('2025-11'), regularPeriod('2025-12'), ...periods]
    movementRows = [...movementRows, ...month('r2025-11', '60.00', '50.00'), ...month('r2025-12', '20.00', '10.00')]
    openingRowsByPeriod['r2025-12'] = [
      { coaId: 'cash', opening: '160.00' },
      { coaId: 'capital', opening: '150.00' },
      { coaId: 'prior', opening: '0.00' },
      { coaId: 'current', opening: '10.00' },
    ]
    const result = await computeBalanceSheet(filter, 'year-end')
    expect(result.compare).toMatchObject({ mode: 'year-end', period: { id: 'r2025-12' }, method: 'opening-table' })
    expect(result.statement.compareTotals).toMatchObject({ assets: '170.00', equity: '170.00', difference: '0.00' })
    expect(result.statement.totals.assets).toBe('250.00')
    expect(openingBalances.mock.calls.map((c) => c[0].periodeId).sort()).toEqual(['r2025-12', 'r2026-03'])
  })

  it('shows no comparison period when the comparison month does not exist', async () => {
    const result = await computeBalanceSheet(filter, 'prev-year')
    expect(result.compare).toEqual({ mode: 'prev-year', period: null, method: null })
    expect(result.statement.compareTotals).toBeNull()
  })

  it('assumes a December year end when the ERP value is not usable', async () => {
    fiscalRaw = null
    const assumed = await computeBalanceSheet(filter, 'none')
    expect(assumed.fiscal).toEqual({ endMonth: 12, assumed: true, yearStart: '2026-01-01' })
    clearCache()
    fiscalRaw = 11
    const read = await computeBalanceSheet(filter, 'none')
    expect(read.fiscal).toEqual({ endMonth: 12, assumed: false, yearStart: '2026-01-01' })
  })

  it('adds lines for the earnings that have no account when the ERP properties are missing', async () => {
    properties = new Map()
    // Without the earnings accounts the opening balance of the earnings account is not read as earnings.
    const result = await computeBalanceSheet(filter, 'none')
    expect(result.earnings).toMatchObject({ currentAccountFound: false, priorAccountFound: false })
    const ids = result.statement.liabilitiesEquity.nodes.map((n) => n.id)
    expect(ids).toContain('__current_year_earnings__')
  })
})
