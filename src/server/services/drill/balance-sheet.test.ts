import { beforeEach, describe, expect, it, vi } from 'vitest'
import { balanceSheetCoaRows, period13Of, regularPeriod } from 'tests/fixtures/balance-sheet.fixture'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import { buildBalanceSheet } from '~/lib/finance/balance-sheet/statement'
import type { AppContextFilter } from '~/server/context'
import type { DrillStep, DrillStepKind } from '~/lib/filters/search-schema'
import type { Id, Money } from '~/lib/core/types'
import type { DrillContext } from './shared'

const tree = buildCoaTree(balanceSheetCoaRows)
const balances = new Map<Id, Money>([
  ['cash', '100.00'],
  ['bank', '50.00'],
  ['ar', '0.00'],
  ['equip', '120.00'],
  ['accdep', '-20.00'],
  ['ap', '80.00'],
  ['loan', '20.00'],
  ['capital', '150.00'],
  ['prior', '0.00'],
  ['current', '20.00'],
])

const computeBalanceSheet = vi.fn()
vi.mock('~/server/services/balance-sheet/balance-sheet.service', () => ({
  computeBalanceSheet: (...a: unknown[]) => computeBalanceSheet(...a),
}))
const journalLines = vi.fn()
vi.mock('~/server/repo/gl/gl.repo', () => ({
  journalLines: (...a: unknown[]) => journalLines(...a),
  journalHeaders: async () => [],
  movementsByPeriods: async () => [],
}))
vi.mock('~/server/db/gl-tables', () => ({ tablesBetween: () => ['gl'] }))
vi.mock('~/server/repo/ap-ar/payment-plan.repo', () => ({ listPlanStatuses: async () => [] }))
vi.mock('~/server/services/cash/cash-flow.service', () => ({}))
vi.mock('~/server/context', () => ({}))

const { balanceSheetDrill } = await import('./balance-sheet')

const filter: AppContextFilter = {
  locationIds: 'all',
  segmentDetailIds: 'all',
  d1: '2026-03-01',
  asOf: '2026-03-15',
  periodIds: ['r2026-03', 'p13-2026'],
  compare: { d1: '', asOf: '', periodIds: [] },
  today: '2026-03-15',
  entitySegmentColumn: 'segment1_id',
  entityCount: 1,
  hasOpenPeriod: true,
  months: ['2026-03'],
  missingMonths: [],
}

const march = regularPeriod('2026-03', 'Open')
const periods = [regularPeriod('2026-02'), march]
const ctx: DrillContext = { filter, tree, periods, activePeriods: [march], entities: [], offset: 0 }

const stepsOf = (...list: DrillStep[]) => new Map<DrillStepKind, DrillStep>(list.map((s) => [s.kind, s]))

beforeEach(() => {
  computeBalanceSheet.mockReset()
  journalLines.mockReset()
  journalLines.mockResolvedValue([])
  computeBalanceSheet.mockResolvedValue({
    status: 'ok',
    statement: buildBalanceSheet({ tree, balances, compareBalances: null, extraLines: [] }),
  })
})

describe('balanceSheetDrill', () => {
  it('lists the accounts of a section with their balances, leaving out accounts without a balance', async () => {
    const result = await balanceSheetDrill(ctx, stepsOf({ kind: 'section', id: 'assets', label: 'Assets' }))
    expect(result).toMatchObject({
      titleKey: 'drill.title.accounts',
      titleLabel: 'Assets',
      nextKind: 'account',
      hasMore: false,
    })
    expect(result.rows).toEqual([
      { id: 'cash', code: '111', name: 'Cash', amount: '100.00' },
      { id: 'bank', code: '112', name: 'Bank', amount: '50.00' },
      { id: 'equip', code: '131', name: 'Equipment', amount: '120.00' },
      { id: 'accdep', code: '132', name: 'Accumulated depreciation', amount: '-20.00' },
    ])
    expect(computeBalanceSheet).toHaveBeenCalledWith(filter, 'none')
  })

  it('lists the liabilities and equity accounts for the other section', async () => {
    const result = await balanceSheetDrill(ctx, stepsOf({ kind: 'section', id: 'liabilitiesEquity', label: 'L&E' }))
    expect(result.rows.map((r) => r.id)).toEqual(['ap', 'loan', 'capital', 'current'])
  })

  it('opens the accounts below a header', async () => {
    const result = await balanceSheetDrill(ctx, stepsOf({ kind: 'folder', id: 'A1', label: 'Cash and bank' }))
    expect(result.rows.map((r) => r.id)).toEqual(['cash', 'bank'])
    expect(result.nextKind).toBe('account')
  })

  it('has nothing for a header or a section that does not exist', async () => {
    expect((await balanceSheetDrill(ctx, stepsOf({ kind: 'folder', id: 'nope', label: 'x' }))).rows).toEqual([])
    expect((await balanceSheetDrill(ctx, stepsOf({ kind: 'section', id: 'other', label: 'x' }))).rows).toEqual([])
    expect((await balanceSheetDrill(ctx, new Map())).rows).toEqual([])
  })

  it('opens the journal lines of the report period for an account', async () => {
    await balanceSheetDrill(ctx, stepsOf({ kind: 'account', id: 'cash', label: 'Cash' }))
    expect(computeBalanceSheet).not.toHaveBeenCalled()
    expect(journalLines).toHaveBeenCalledTimes(1)
    expect(journalLines.mock.calls[0]?.[0]).toMatchObject({
      periods: [march],
      coaIds: ['cash'],
      segCol: 'segment1_id',
      segIds: 'all',
    })
  })

  it('adds the period 13 to the journal lines when the report includes it', async () => {
    const p13 = period13Of(2026)
    const decPeriods = [regularPeriod('2026-12'), p13]
    const decCtx: DrillContext = {
      ...ctx,
      periods: decPeriods,
      filter: { ...filter, asOf: '2026-12-31', periodIds: ['r2026-12', 'p13-2026'] },
    }
    await balanceSheetDrill(decCtx, stepsOf({ kind: 'account', id: 'cash', label: 'Cash' }))
    expect(journalLines.mock.calls[0]?.[0].periods.map((p: { periodeId: string }) => p.periodeId)).toEqual([
      'r2026-12',
      'p13-2026',
    ])
  })

  it('has no journal lines when the end month of the filter has no period', async () => {
    const result = await balanceSheetDrill(
      { ...ctx, periods: [], filter: { ...filter, asOf: '2026-12-15', periodIds: [] } },
      stepsOf({ kind: 'account', id: 'cash', label: 'Cash' }),
    )
    expect(result.rows).toEqual([])
    expect(journalLines).not.toHaveBeenCalled()
  })
})
