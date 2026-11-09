import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import type { AppContextFilter } from '~/server/context'
import type { DrillState, DrillStep, DrillStepKind } from '~/lib/filters/search-schema'
import type { PaymentPlanBill } from '~/lib/finance/ap-ar/payment-plan'
import type { DrillContext, DrillResult } from './shared'

const apOpenInvoices = vi.fn()
const arOpenInvoices = vi.fn()
const listCustomers = vi.fn()
const computePaymentPlan = vi.fn()
vi.mock('~/server/services/ap-ar/payment-plan.service', () => ({
  computePaymentPlan: (...a: unknown[]) => computePaymentPlan(...a),
}))
vi.mock('~/server/repo/ap-ar/aging.repo', () => ({
  apOpenInvoices: (...a: unknown[]) => apOpenInvoices(...a),
  arOpenInvoices: (...a: unknown[]) => arOpenInvoices(...a),
}))
vi.mock('~/server/repo/ap-ar/party.repo', () => ({
  listVendors: async () => [{ vendorId: 'v1', code: 'V1', name: 'Vendor 1' }],
  listCustomers: (...a: unknown[]) => listCustomers(...a),
}))
vi.mock('~/server/repo/gl/gl.repo', () => ({
  journalLines: async () => [],
  journalHeaders: async () => [],
  movementsByPeriods: async () => [],
}))
vi.mock('~/server/db/gl-tables', () => ({ tablesBetween: () => ['gl'] }))
vi.mock('~/server/repo/ap-ar/payment-plan.repo', () => ({ listPlanStatuses: async () => [] }))
vi.mock('~/server/services/cash/cash-flow.service', () => ({}))
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

const planBill = (invoiceId: string, o: Partial<PaymentPlanBill> = {}): PaymentPlanBill => ({
  invoiceId,
  vendorId: 'v1',
  vendorName: 'Vendor 1',
  entityName: 'Store B',
  invoiceNumber: `INV-${invoiceId}`,
  dueDate: '2026-10-15',
  balance: '100.00',
  status: 'notSubmitted',
  overdue: false,
  kind: 'bill',
  ...o,
})
const plan = (bills: PaymentPlanBill[]) => ({ bills })

describe('paymentPlanDrill: bills of one day (rows come from the payment plan)', () => {
  beforeEach(() => {
    computePaymentPlan.mockReset()
    computePaymentPlan.mockResolvedValue(plan([planBill('1')]))
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

  it('shows a bill and the credit row that reduces it, in due date then id order, with the plan status', async () => {
    computePaymentPlan.mockResolvedValue(
      plan([
        planBill('credit:b1', { kind: 'credit', balance: '-30.00', invoiceNumber: '', status: 'approved' }),
        planBill('b1', { status: 'approved' }),
      ]),
    )
    const res = await paymentPlanDrill(ctxWith(1), dayStep)
    expect(res.rows.map((r) => r.id)).toEqual(['b1', 'credit:b1'])
    expect(res.rows[0]).toMatchObject({
      balance: '100.00',
      invoiceNumber: 'INV-b1',
      status: 'approved',
      dueDate: '2026-10-15',
    })
    expect(res.rows[1]).toMatchObject({ balance: '-30.00', invoiceNumber: '', status: 'approved' })
    expect(res.titleKey).toBe('drill.title.dueBills')
    expect(res.nextKind).toBe('card')
  })

  it('shows the overdue bills on day 0 (today) only', async () => {
    computePaymentPlan.mockResolvedValue(
      plan([
        planBill('old', { dueDate: '2026-10-10', overdue: true }),
        planBill('today'),
        planBill('tomorrow', { dueDate: '2026-10-16' }),
      ]),
    )
    const day0 = await paymentPlanDrill(ctxWith(1), dayStep) // dayStep is today (2026-10-15)
    expect(day0.rows.map((r) => r.id)).toEqual(['old', 'today'])

    const day1 = await paymentPlanDrill(ctxWith(1), { kind: 'day', id: '2026-10-16', label: '16 Oct' })
    expect(day1.rows.map((r) => r.id)).toEqual(['tomorrow'])
  })

  it('asks for the smallest plan horizon that reaches the day, without inflows', async () => {
    const ask = async (day: string) => {
      computePaymentPlan.mockClear()
      await paymentPlanDrill(ctxWith(1), { kind: 'day', id: day, label: day })
      return computePaymentPlan.mock.calls[0]
    }
    const filter = filterWith(1)
    expect(await ask('2026-10-15')).toEqual([filter, { horizon: '7', inflow: false }]) // day 1
    expect(await ask('2026-10-21')).toEqual([filter, { horizon: '7', inflow: false }]) // day 7
    expect(await ask('2026-10-22')).toEqual([filter, { horizon: '14', inflow: false }]) // day 8
    expect(await ask('2026-10-28')).toEqual([filter, { horizon: '14', inflow: false }]) // day 14
    expect(await ask('2026-10-29')).toEqual([filter, { horizon: '30', inflow: false }]) // day 15
  })

  it('cuts the page after sorting and says whether more rows follow', async () => {
    computePaymentPlan.mockResolvedValue(plan(Array.from({ length: 250 }, (_, n) => planBill(String(1000 + n)))))
    const first = await paymentPlanDrill(ctxWith(1), dayStep)
    expect(first.rows).toHaveLength(200)
    expect(first.hasMore).toBe(true)
    const second = await paymentPlanDrill({ ...ctxWith(1), offset: 200 }, dayStep)
    expect(second.rows).toHaveLength(50)
    expect(second.hasMore).toBe(false)
  })
})

const arInvoice = (invoiceId: string, customerId: string, dueDate: string, balance = '100.00') => ({
  invoiceId,
  invoiceNumber: `SI-${invoiceId}`,
  customerId,
  locationId: 'locA',
  coaId: '1',
  txDate: '2026-09-01',
  dueDate,
  itemType: 0,
  originalAmount: balance,
  balance,
})

const customerStep: DrillStep = { kind: 'customer', id: 'c1', label: 'Customer 1' }
const arDrill: DrillState = { metric: 'arAging', steps: [customerStep] }
const bucketStep: DrillStep = { kind: 'bucket', id: 'overdue0_30', label: '1-30 days' }

describe('apArDrill: the two sides of the aging drill-down', () => {
  beforeEach(() => {
    apOpenInvoices.mockReset()
    arOpenInvoices.mockReset()
    listCustomers.mockReset()
    apOpenInvoices.mockResolvedValue([invoice('1', 'locA', '2026-10-02')])
    arOpenInvoices.mockResolvedValue([])
    listCustomers.mockResolvedValue([])
  })

  it('reads the list of the side that was asked for, as of the day after the date, for the chosen entities', async () => {
    await apArDrill(ctxWith(1), drill, steps)
    expect(apOpenInvoices).toHaveBeenCalledWith('2026-10-16', 'all')
    expect(arOpenInvoices).not.toHaveBeenCalled()

    apOpenInvoices.mockClear()
    await apArDrill(ctxWith(1), arDrill, new Map<DrillStepKind, DrillStep>([['customer', customerStep]]))
    expect(arOpenInvoices).toHaveBeenCalledWith('2026-10-16', 'all')
    expect(apOpenInvoices).not.toHaveBeenCalled()
  })

  it('lists the bills of one vendor with a plan status column', async () => {
    const res = await apArDrill(ctxWith(1), drill, steps)
    expect(res.titleKey).toBe('drill.title.bills')
    expect(res.titleLabel).toBe('Vendor 1')
    expect(res.columns.map((c) => c.id)).toEqual(['invoiceNumber', 'txDate', 'dueDate', 'balance', 'status'])
    expect(res.rows[0]?.id).toBe('1')
    expect(res.rows[0]?.status).toBe('notSubmitted')
    expect(res.nextKind).toBe('card')
  })

  it('lists the invoices of one customer without a plan status column', async () => {
    arOpenInvoices.mockResolvedValue([
      arInvoice('a1', 'c1', '2026-10-10'),
      arInvoice('a2', 'c2', '2026-10-10'),
      arInvoice('a3', 'c1', '2026-10-10', '0.00'),
    ])
    const res = await apArDrill(ctxWith(1), arDrill, new Map<DrillStepKind, DrillStep>([['customer', customerStep]]))
    expect(res.titleKey).toBe('drill.title.invoices')
    expect(res.titleLabel).toBe('Customer 1')
    expect(res.columns.map((c) => c.id)).toEqual(['invoiceNumber', 'txDate', 'dueDate', 'balance'])
    // only the customer's own invoices that still have a balance
    expect(res.rows.map((r) => r.id)).toEqual(['a1'])
    expect(res.rows[0]).not.toHaveProperty('status')
    expect(res.nextKind).toBe('card')
  })

  it('totals the customers of one aging bucket, largest first, and names them from the lookup', async () => {
    arOpenInvoices.mockResolvedValue([
      arInvoice('a1', 'c1', '2026-10-10', '100.00'),
      arInvoice('a2', 'c1', '2026-10-12', '50.50'),
      arInvoice('a3', 'c2', '2026-10-10', '300.00'),
      arInvoice('a4', 'c2', '2026-07-01', '999.00'), // 106 days overdue: another bucket
      arInvoice('a5', 'c3', '2026-10-10', '-20.00'), // a credit, not an invoice with a balance
    ])
    listCustomers.mockResolvedValue([{ customerId: 'c1', code: 'C1', name: 'Customer 1' }])
    const arBucketDrill: DrillState = { metric: 'arAging', steps: [bucketStep] }

    const res = await apArDrill(ctxWith(1), arBucketDrill, new Map<DrillStepKind, DrillStep>([['bucket', bucketStep]]))

    expect(res.titleKey).toBe('drill.title.customers')
    expect(res.titleLabel).toBe('1-30 days')
    expect(res.columns.map((c) => c.id)).toEqual(['code', 'name', 'amount'])
    // c2 has no name in the lookup: its id stands in, and its code is empty
    expect(res.rows).toEqual([
      { id: 'c2', code: '', name: 'c2', amount: '300.00' },
      { id: 'c1', code: 'C1', name: 'Customer 1', amount: '150.50' },
    ])
    expect(listCustomers).toHaveBeenCalledWith(['c2', 'c1'])
    expect(res.nextKind).toBe('customer')
  })

  it('totals the vendors when no bucket is chosen, and leads on to the vendor step', async () => {
    apOpenInvoices.mockResolvedValue([
      invoice('1', 'locA', '2026-10-02'),
      { ...invoice('3', 'locA', '2026-10-03'), vendorId: 'v2', balance: '40.00' },
    ])
    const res = await apArDrill(ctxWith(1), { metric: 'apAging', steps: [] }, new Map<DrillStepKind, DrillStep>())

    expect(res.titleKey).toBe('drill.title.vendors')
    expect(res.titleLabel).toBe('')
    expect(res.rows).toEqual([
      { id: 'v1', code: 'V1', name: 'Vendor 1', amount: '100.00' },
      { id: 'v2', code: '', name: 'v2', amount: '40.00' },
    ])
    expect(res.nextKind).toBe('vendor')
  })
})
