import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree, type CoaRow } from '~/lib/finance/coa/coa-tree'
import type { Period } from '~/lib/core/types'

/**
 * Query budgets: how many repository (= SQL) calls a metric may make per request.
 * The repositories are mocked, so these tests need no database; they fail when a service
 * starts repeating reads that should be shared (N+1 / duplicated work).
 */

const coaRows: CoaRow[] = [
  { coaId: '1', parentId: '0', code: '4-1000', name: 'Sales', status: 'POSTABLE', level: 1, accountGroup: 'Revenue', subAccountGroup: '', saldoNormal: 'CREDIT' },
  { coaId: '2', parentId: '0', code: '6-1000', name: 'Rent', status: 'POSTABLE', level: 1, accountGroup: 'Expense', subAccountGroup: '', saldoNormal: 'DEBET' },
  { coaId: '3', parentId: '0', code: '2-1000', name: 'Trade payable', status: 'POSTABLE', level: 1, accountGroup: 'Current Liabilities', subAccountGroup: 'Account Payable', saldoNormal: 'CREDIT' },
]
const tree = buildCoaTree(coaRows)
const periods: Period[] = [
  { periodeId: 'p0', name: 'Sep', startDate: '2026-09-01', endDate: '2026-09-30', status: 'Closed', type: 0, tableName: 'gl' },
  { periodeId: 'p1', name: 'Oct', startDate: '2026-10-01', endDate: '2026-10-31', status: 'Open', type: 0, tableName: 'gl' },
]

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({
  getCachedCoaTree: async () => tree,
  getCachedPeriods: async () => periods,
  getCachedEntities: async () => ({ segment: { segmentId: 's', columnName: 'segment1_id' }, entities: [] }),
  buildMetricMeta: () => ({
    readAt: 'now', d1: '2026-10-01', asOf: '2026-10-15', today: '2026-10-15', entityCount: 1,
    isAllEntities: true, hasOpenPeriod: true, missingMonths: [],
  }),
}))

const movementsByPeriods = vi.fn()
const apOpenInvoices = vi.fn()
const apUnallocatedPayments = vi.fn()
const listVendors = vi.fn()
const listActivePlanStatuses = vi.fn()
const listPlanStatuses = vi.fn()
const budgetAmounts = vi.fn()
const balancesAt = vi.fn()
const computeCashPosition = vi.fn()

vi.mock('~/server/repo/gl.repo', () => ({ movementsByPeriods: (...a: unknown[]) => movementsByPeriods(...a) }))
vi.mock('~/server/repo/aging.repo', () => ({
  apOpenInvoices: (...a: unknown[]) => apOpenInvoices(...a),
  apUnallocatedPayments: (...a: unknown[]) => apUnallocatedPayments(...a),
}))
vi.mock('~/server/repo/party.repo', () => ({ listVendors: (...a: unknown[]) => listVendors(...a) }))
vi.mock('~/server/repo/payment-plan.repo', () => ({
  listActivePlanStatuses: (...a: unknown[]) => listActivePlanStatuses(...a),
  listPlanStatuses: (...a: unknown[]) => listPlanStatuses(...a),
}))
vi.mock('~/server/repo/budget.repo', () => ({ budgetAmounts: (...a: unknown[]) => budgetAmounts(...a) }))
vi.mock('~/server/repo/bank-payment.repo', () => ({ unsettledByChannel: async () => [], settlementLag: async () => [] }))
vi.mock('~/server/services/balance.service', () => ({ balancesAt: (...a: unknown[]) => balancesAt(...a) }))
vi.mock('~/server/services/cash-position.service', () => ({ computeCashPosition: (...a: unknown[]) => computeCashPosition(...a) }))
vi.mock('~/server/services/shared/mapping.helper', () => ({
  loadAccountMapping: async () => ({
    version: 1,
    updatedAt: 'now',
    baskets: {
      cash: { include: [] },
      bank: { include: [] },
      deposit: { include: [] },
      inTransit: { include: [] },
      fixedCost: { include: ['2'] },
    },
  }),
}))

const { computePnl } = await import('./pnl.service')
const { computeFixedCost } = await import('./fixed-cost.service')
const { computeBudget } = await import('./budget.service')
const { computeRevenue } = await import('./revenue.service')
const { computePaymentPlan } = await import('./payment-plan.service')
const { computeApAging } = await import('./ap-aging.service')
const { listAgingParties } = await import('./aging-parties.service')
const { clearCache } = await import('~/server/cache')

function filterFor(id: string) {
  // `id` makes every test use its own memo key
  return {
    locationIds: 'all' as const,
    segmentDetailIds: 'all' as const,
    d1: '2026-10-01',
    asOf: '2026-10-15',
    periodIds: ['p1'],
    compare: { d1: '2026-09-01', asOf: '2026-09-15', periodIds: [] as string[] },
    today: '2026-10-15',
    entitySegmentColumn: 'segment1_id',
    entityCount: 1,
    hasOpenPeriod: true,
    months: ['2026-10'],
    missingMonths: [] as string[],
    _test: id,
  }
}

describe('metric query budgets', () => {
  beforeEach(() => {
    clearCache()
    for (const m of [movementsByPeriods, apOpenInvoices, apUnallocatedPayments, listVendors, balancesAt, listActivePlanStatuses, listPlanStatuses, budgetAmounts, computeCashPosition]) m.mockReset()
    movementsByPeriods.mockResolvedValue([])
    listActivePlanStatuses.mockResolvedValue([])
    budgetAmounts.mockResolvedValue([])
    computeCashPosition.mockResolvedValue({ cashPosition: '1000.00' })
    apOpenInvoices.mockResolvedValue([])
    apUnallocatedPayments.mockResolvedValue([])
    listVendors.mockResolvedValue([])
    balancesAt.mockResolvedValue({ byCoa: new Map(), method: 'opening-table' })
  })

  it('P&L reads GL movements once, even when Summary and Runway ask for it at the same time', async () => {
    const filter = filterFor('pnl')
    await Promise.all([computePnl(filter), computePnl(filter), computePnl(filter)])
    expect(movementsByPeriods).toHaveBeenCalledTimes(1)
  })

  it('P&L with a comparison period needs exactly two GL reads', async () => {
    const filter = { ...filterFor('pnl-compare'), compare: { d1: '2026-09-01', asOf: '2026-09-30', periodIds: ['p0'] } }
    await computePnl(filter)
    expect(movementsByPeriods).toHaveBeenCalledTimes(2)
  })

  it('P&L, Fixed Cost and Budget share ONE GL read for the same periods', async () => {
    const filter = filterFor('pl-shared')
    await Promise.all([computePnl(filter), computeFixedCost(filter), computeBudget(filter)])
    expect(movementsByPeriods).toHaveBeenCalledTimes(1)
    // the shared read covers the P&L accounts and the fixed-cost basket together
    const asked = movementsByPeriods.mock.calls[0]![0] as { coaIds: string[] }
    expect(asked.coaIds.sort()).toEqual(['1', '2'])
  })

  it('Revenue needs one read of its own (per-entity split); its comparison reuses the shared P&L read', async () => {
    const filter = { ...filterFor('revenue'), compare: { d1: '2026-09-01', asOf: '2026-09-30', periodIds: ['p0'] } }
    await Promise.all([computeRevenue(filter), computePnl(filter)])
    // revenue (by location) + P&L current period + comparison (shared by both) = 3, not 4
    expect(movementsByPeriods).toHaveBeenCalledTimes(3)
  })

  it('computing the same metric again within the memo window reads nothing', async () => {
    const filter = filterFor('memo-window')
    await Promise.all([computeRevenue(filter), computeFixedCost(filter), computeBudget(filter)])
    const reads = movementsByPeriods.mock.calls.length
    await Promise.all([computeRevenue(filter), computeFixedCost(filter), computeBudget(filter)])
    expect(movementsByPeriods).toHaveBeenCalledTimes(reads)
    expect(budgetAmounts).toHaveBeenCalledTimes(1)
  })

  it('Payment Plan asks for payment-voucher statuses once, however many invoices are open', async () => {
    apOpenInvoices.mockResolvedValue(
      Array.from({ length: 2500 }, (_, n) => ({
        invoiceId: `i${n}`, vendorId: `v${n % 10}`, locationId: 'l1', coaId: '3', txDate: '2026-09-01',
        dueDate: '2026-10-15', itemType: 0, originalAmount: '10.00', balance: '10.00',
      })),
    )
    listActivePlanStatuses.mockResolvedValue([{ invoiceId: 'i1', status: 'Posted' }])
    const plan = await computePaymentPlan(filterFor('plan'), { horizon: '7', inflow: false })

    expect(listActivePlanStatuses).toHaveBeenCalledTimes(1)
    expect(listPlanStatuses).not.toHaveBeenCalled()
    expect(plan.bills.find((b) => b.invoiceId === 'i1')!.status).toBe('approved')
    expect(plan.bills.find((b) => b.invoiceId === 'i2')!.status).toBe('notSubmitted')
  })

  it('Payment Plan leaves out bills due after the horizon', async () => {
    apOpenInvoices.mockResolvedValue([
      { invoiceId: 'soon', vendorId: 'v1', locationId: 'l1', coaId: '3', txDate: '2026-09-01', dueDate: '2026-10-17', itemType: 0, originalAmount: '10.00', balance: '10.00' },
      { invoiceId: 'late', vendorId: 'v1', locationId: 'l1', coaId: '3', txDate: '2026-09-01', dueDate: '2026-12-31', itemType: 0, originalAmount: '10.00', balance: '10.00' },
    ])
    const plan = await computePaymentPlan(filterFor('plan-horizon'), { horizon: '7', inflow: false })
    expect(plan.bills.map((b) => b.invoiceId)).toEqual(['soon'])
  })

  it('AP Aging reads open invoices and unallocated payments once each, and vendor names in one batch', async () => {
    apOpenInvoices.mockResolvedValue([
      { invoiceId: 'i1', vendorId: 'v1', locationId: 'l1', coaId: '3', txDate: '2026-09-01', dueDate: '2026-10-01', itemType: 0, originalAmount: '100.00', balance: '100.00' },
      { invoiceId: 'i2', vendorId: 'v2', locationId: 'l1', coaId: '3', txDate: '2026-09-02', dueDate: '2026-10-02', itemType: 0, originalAmount: '50.00', balance: '50.00' },
    ])
    const filter = { ...filterFor('ap'), compare: { d1: '', asOf: '', periodIds: [] as string[] } } // no comparison period
    await Promise.all([computeApAging(filter), computeApAging(filter)])

    expect(apOpenInvoices).toHaveBeenCalledTimes(1)
    expect(apUnallocatedPayments).toHaveBeenCalledTimes(1)
    expect(listVendors).toHaveBeenCalledTimes(1)
    expect(listVendors.mock.calls[0]![0].sort()).toEqual(['v1', 'v2'])
    // GL reconciliation: one balance read for all control accounts, not one per account
    expect(balancesAt).toHaveBeenCalledTimes(1)
  })

  it('AP Aging with a comparison date reads each side twice (current + compare) and no more', async () => {
    await computeApAging(filterFor('ap-compare'))
    expect(apOpenInvoices).toHaveBeenCalledTimes(2)
    expect(apUnallocatedPayments).toHaveBeenCalledTimes(2)
    expect(listVendors).toHaveBeenCalledTimes(1)
  })

  it('AP Aging starts the invoice and payment reads together, not one after the other', async () => {
    const order: string[] = []
    apOpenInvoices.mockImplementation(async () => {
      order.push('invoices:start')
      await new Promise((r) => setTimeout(r, 10))
      order.push('invoices:end')
      return []
    })
    apUnallocatedPayments.mockImplementation(async () => {
      order.push('payments:start')
      return []
    })
    await computeApAging(filterFor('ap-parallel'))
    expect(order.slice(0, 2)).toEqual(['invoices:start', 'payments:start'])
  })

  it('paging and sorting the vendor table never reads the DB again', async () => {
    apOpenInvoices.mockResolvedValue(
      Array.from({ length: 120 }, (_, n) => ({
        invoiceId: `i${n}`, vendorId: `v${n}`, locationId: 'l1', coaId: '3', txDate: '2026-09-01',
        dueDate: '2026-10-01', itemType: 0, originalAmount: '10.00', balance: String(n + 1),
      })),
    )
    const filter = { ...filterFor('parties'), compare: { d1: '', asOf: '', periodIds: [] as string[] } }

    const first = await listAgingParties('ap', filter, { page: 1, pageSize: 25, sortBy: 'total', sortDir: 'desc' })
    const last = await listAgingParties('ap', filter, { page: 5, pageSize: 25, sortBy: 'total', sortDir: 'desc' })
    await listAgingParties('ap', filter, { page: 2, pageSize: 50, sortBy: 'name', sortDir: 'asc' })

    expect(first.total).toBe(120)
    expect(first.rows).toHaveLength(25)
    expect(first.rows[0]!.total).toBe('120.00')
    expect(last.rows).toHaveLength(20)
    expect(last.rows.at(-1)!.total).toBe('1.00')
    expect(apOpenInvoices).toHaveBeenCalledTimes(1)
    expect(listVendors).toHaveBeenCalledTimes(1)
  })
})
