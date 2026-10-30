import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import type { AppContextFilter } from '~/server/context'
import type { DrillState, DrillStep, DrillStepKind } from '~/lib/filters/search-schema'
import type { DrillContext, DrillResult } from './shared'

const apOpenInvoices = vi.fn()
vi.mock('~/server/repo/aging.repo', () => ({
  apOpenInvoices: (...a: unknown[]) => apOpenInvoices(...a),
  arOpenInvoices: async () => [],
}))
vi.mock('~/server/repo/party.repo', () => ({
  listVendors: async () => [{ vendorId: 'v1', code: 'V1', name: 'Vendor 1' }],
  listCustomers: async () => [],
}))
vi.mock('~/server/repo/gl.repo', () => ({
  journalLines: async () => [],
  journalHeaders: async () => [],
  movementsByPeriods: async () => [],
}))
vi.mock('~/server/db/gl-tables', () => ({ tablesBetween: () => ['gl'] }))
vi.mock('~/server/repo/payment-plan.repo', () => ({ listPlanStatuses: async () => [] }))
vi.mock('~/server/services/cash-flow.service', () => ({}))
vi.mock('~/server/context', () => ({}))

const { apArDrill, paymentPlanDrill } = await import('./ap-ar')

const entities = [
  { locationId: 'locA', code: 'A', name: 'Store A', isActive: true, segmentDetailIds: ['sA'] },
  { locationId: 'locB', code: 'B', name: 'Store B', isActive: true, segmentDetailIds: ['sB'] },
]

const filterWith = (entityCount: number): AppContextFilter => ({
  locationIds: 'all',
  segmentDetailIds: 'all',
  d1: '2026-10-01',
  asOf: '2026-10-15',
  periodIds: [],
  compare: { d1: '', asOf: '', periodIds: [] },
  today: '2026-10-15',
  entitySegmentColumn: 'segment1_id',
  entityCount,
  hasOpenPeriod: true,
  months: ['2026-10'],
  missingMonths: [],
})

const ctxWith = (entityCount: number): DrillContext => ({
  filter: filterWith(entityCount),
  tree: buildCoaTree([]),
  periods: [],
  activePeriods: [],
  entities,
  offset: 0,
})

const invoice = (invoiceId: string, locationId: string, txDate: string) => ({
  invoiceId,
  invoiceNumber: `INV-${invoiceId}`,
  vendorId: 'v1',
  locationId,
  coaId: '1',
  txDate,
  dueDate: '2026-10-10',
  itemType: 0,
  originalAmount: '100.00',
  balance: '100.00',
})

const vendorStep: DrillStep = { kind: 'vendor', id: 'v1', label: 'Vendor 1' }
const drill: DrillState = { metric: 'apAging', steps: [vendorStep] }
const steps = new Map<DrillStepKind, DrillStep>([['vendor', vendorStep]])
const dayStep: DrillStep = { kind: 'day', id: '2026-10-15', label: '15 Oct' }

describe('apArDrill: invoices of one vendor', () => {
  beforeEach(() => {
    apOpenInvoices.mockReset()
    apOpenInvoices.mockResolvedValue([invoice('1', 'locA', '2026-10-02'), invoice('2', '', '2026-10-01')])
  })

  it('names the owning entity of every invoice when several entities are in scope', async () => {
    const res: DrillResult = await apArDrill(ctxWith(2), drill, steps)
    expect(res.showEntity).toBe(true)
    // Newest transaction first: invoice 1 (known location), then invoice 2 (no location).
    expect(res.rows.map((r) => r.entityName)).toEqual(['Store A', null])
  })

  it('adds nothing when only one entity is in scope', async () => {
    const res: DrillResult = await apArDrill(ctxWith(1), drill, steps)
    expect(res.showEntity).toBe(false)
    expect(res.rows[0]).not.toHaveProperty('entityName')
  })
})

describe('paymentPlanDrill: bills of one day', () => {
  beforeEach(() => {
    apOpenInvoices.mockReset()
    apOpenInvoices.mockResolvedValue([invoice('1', 'locB', '2026-10-02')])
  })

  it('names the owning entity of every bill when several entities are in scope', async () => {
    const res = await paymentPlanDrill(ctxWith(2), dayStep)
    expect(res.showEntity).toBe(true)
    expect(res.rows[0]?.vendor).toBe('Vendor 1')
    expect(res.rows[0]?.entityName).toBe('Store B')
  })

  it('adds nothing when only one entity is in scope', async () => {
    const res = await paymentPlanDrill(ctxWith(1), dayStep)
    expect(res.showEntity).toBe(false)
    expect(res.rows[0]).not.toHaveProperty('entityName')
  })
})
