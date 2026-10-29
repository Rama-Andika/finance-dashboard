import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree, type CoaRow } from '~/lib/finance/coa-tree'
import type { Period } from '~/lib/finance/types'

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
  { periodeId: 'p1', name: 'Oct', startDate: '2026-10-01', endDate: '2026-10-31', status: 'Open', type: 0, tableName: 'gl' },
]

vi.mock('~/server/env', () => ({ env: { ociRootCodes: [], APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({
  getCachedCoaTree: async () => tree,
  getCachedPeriods: async () => periods,
  buildMetricMeta: () => ({
    readAt: 'now', d1: '2026-10-01', asOf: '2026-10-15', today: '2026-10-15', entityCount: 1,
    isAllEntities: true, hasOpenPeriod: true, missingMonths: [],
  }),
}))

const movementsByPeriods = vi.fn()
const apOpenInvoices = vi.fn()
const apUnallocatedPayments = vi.fn()
const listVendors = vi.fn()
const balancesAt = vi.fn()

vi.mock('~/server/repo/gl.repo', () => ({ movementsByPeriods: (...a: unknown[]) => movementsByPeriods(...a) }))
vi.mock('~/server/repo/apar.repo', () => ({
  apOpenInvoices: (...a: unknown[]) => apOpenInvoices(...a),
  apUnallocatedPayments: (...a: unknown[]) => apUnallocatedPayments(...a),
  listVendors: (...a: unknown[]) => listVendors(...a),
}))
vi.mock('~/server/services/balance.service', () => ({ balancesAt: (...a: unknown[]) => balancesAt(...a) }))

const { computePnl } = await import('./pnl.service')
const { computeApAging } = await import('./ap-aging.service')
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
    for (const m of [movementsByPeriods, apOpenInvoices, apUnallocatedPayments, listVendors, balancesAt]) m.mockReset()
    movementsByPeriods.mockResolvedValue([])
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
    const filter = { ...filterFor('pnl-compare'), compare: { d1: '2026-09-01', asOf: '2026-09-30', periodIds: ['p1'] } }
    await computePnl(filter)
    expect(movementsByPeriods).toHaveBeenCalledTimes(2)
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
})
