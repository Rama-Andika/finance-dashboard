import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { ApOpenInvoiceRow } from '~/server/repo/ap-ar/aging.repo'

vi.mock('~/server/context', () => ({
  buildMetricMeta: () => ({ meta: true }),
  getCachedCoaTree: async () => ({}),
  getCachedEntities: async () => ({ entities: [] }),
}))
vi.mock('~/server/services/shared/resolved-baskets', () => ({
  loadResolvedBaskets: async () => ({ inTransit: [] }),
}))
const computeCashPosition = vi.fn()
vi.mock('~/server/services/cash/cash-position.service', () => ({
  computeCashPosition: (...args: unknown[]) => computeCashPosition(...args),
}))
const apOpenInvoices = vi.fn()
vi.mock('~/server/repo/ap-ar/aging.repo', () => ({
  agingDueTotals: async () => null,
  agingCreditData: async () => null,
  apOpenInvoices: (...args: unknown[]) => apOpenInvoices(...args),
  arOpenInvoices: async () => [],
  arDirectReturns: async () => [],
}))
const listActivePlanStatuses = vi.fn()
vi.mock('~/server/repo/ap-ar/payment-plan.repo', () => ({
  listActivePlanStatuses: (...args: unknown[]) => listActivePlanStatuses(...args),
}))
vi.mock('~/server/repo/ap-ar/party.repo', () => ({
  listVendors: async () => [
    { vendorId: 'v1', code: 'V1', name: 'Beta Supplies' },
    { vendorId: 'v2', code: 'V2', name: 'Alpha Trading' },
  ],
}))
vi.mock('~/server/repo/cash/bank-payment.repo', () => ({
  unsettledByChannel: async () => [],
  settlementLag: async () => [],
}))

const { listPaymentPlanBills } = await import('./payment-plan.service')
const { clearCache } = await import('~/server/cache')

const TODAY = '2026-06-15'
const filterOf = (entityCount: number) =>
  ({
    today: TODAY,
    locationIds: 'all',
    segmentDetailIds: 'all',
    entitySegmentColumn: 'segment1_id',
    entityCount,
  }) as never
const opts = { horizon: '7' as const, inflow: false }
const firstPage = { page: 1, pageSize: 25, sortDir: 'asc' as const }

const bill = (invoiceId: string, vendorId: string, dueDate: string, balance: string): ApOpenInvoiceRow => ({
  invoiceId,
  invoiceNumber: `INV-${invoiceId}`,
  vendorId,
  locationId: 'l1',
  coaId: 'c',
  txDate: '2026-05-01',
  dueDate,
  itemType: 1,
  originalAmount: balance,
  balance,
})

describe('listPaymentPlanBills', () => {
  beforeEach(() => {
    clearCache()
    computeCashPosition.mockReset()
    apOpenInvoices.mockReset()
    listActivePlanStatuses.mockReset()
    computeCashPosition.mockResolvedValue({ cashPosition: '5000.00' })
    listActivePlanStatuses.mockResolvedValue([])
    apOpenInvoices.mockResolvedValue([
      bill('a', 'v1', '2026-06-10', '100.00'), // overdue
      bill('b', 'v1', '2026-06-16', '50.00'), // due inside the horizon
      bill('c', 'v2', '2026-06-18', '70.00'), // due inside the horizon
      bill('d', 'v2', '2026-06-30', '999.00'), // due after the horizon: not part of the plan
    ])
  })

  it('shows the bills that are not overdue on the "due" tab and counts both tabs', async () => {
    const page = await listPaymentPlanBills(filterOf(1), opts, firstPage, 'due')
    expect(page.rows.map((r) => r.invoiceId)).toEqual(['b', 'c'])
    expect(page.total).toBe(2)
    expect(page.scopes).toEqual({
      due: { count: 2, total: '120.00' },
      overdue: { count: 1, total: '100.00' },
    })
  })

  it('shows the overdue bills on the "overdue" tab, with the vendor name and the invoice number', async () => {
    const page = await listPaymentPlanBills(filterOf(1), opts, firstPage, 'overdue')
    expect(page.rows).toHaveLength(1)
    expect(page.rows[0]).toMatchObject({
      invoiceId: 'a',
      vendorName: 'Beta Supplies',
      invoiceNumber: 'INV-a',
      balance: '100.00',
      overdue: true,
      kind: 'bill',
    })
  })

  it('sorts by the chosen column and direction', async () => {
    const byBalance = await listPaymentPlanBills(
      filterOf(1),
      opts,
      { ...firstPage, sortBy: 'balance', sortDir: 'desc' },
      'due',
    )
    expect(byBalance.rows.map((r) => r.invoiceId)).toEqual(['c', 'b'])
    const byVendor = await listPaymentPlanBills(
      filterOf(1),
      opts,
      { ...firstPage, sortBy: 'vendorName', sortDir: 'asc' },
      'due',
    )
    expect(byVendor.rows.map((r) => r.vendorName)).toEqual(['Alpha Trading', 'Beta Supplies'])
  })

  it('ignores a sort column that is not on the list of sortable columns', async () => {
    const page = await listPaymentPlanBills(
      filterOf(1),
      opts,
      { ...firstPage, sortBy: 'password', sortDir: 'desc' },
      'due',
    )
    expect(page.rows.map((r) => r.invoiceId)).toEqual(['b', 'c'])
  })

  it('returns one page at a time and keeps the total of the whole tab', async () => {
    const second = await listPaymentPlanBills(filterOf(1), opts, { page: 2, pageSize: 1, sortDir: 'asc' }, 'due')
    expect(second.rows.map((r) => r.invoiceId)).toEqual(['c'])
    expect(second).toMatchObject({ total: 2, page: 2, pageSize: 1 })
    const past = await listPaymentPlanBills(filterOf(1), opts, { page: 9, pageSize: 1, sortDir: 'asc' }, 'due')
    expect(past.page).toBe(2)
  })

  it('asks the entity column to be shown only when more than one entity is in scope', async () => {
    expect((await listPaymentPlanBills(filterOf(1), opts, firstPage, 'due')).showEntity).toBe(false)
    expect((await listPaymentPlanBills(filterOf(3), opts, firstPage, 'due')).showEntity).toBe(true)
  })

  it('says whether any bill has a live voucher document', async () => {
    expect((await listPaymentPlanBills(filterOf(1), opts, firstPage, 'due')).planStatusInUse).toBe(false)
    clearCache()
    listActivePlanStatuses.mockResolvedValue([{ invoiceId: 'b', status: 'Posted' }])
    const page = await listPaymentPlanBills(filterOf(1), opts, firstPage, 'due')
    expect(page.planStatusInUse).toBe(true)
    expect(page.rows.find((r) => r.invoiceId === 'b')?.status).toBe('approved')
  })

  it('builds the plan once for every page and tab of the same filter', async () => {
    await listPaymentPlanBills(filterOf(1), opts, firstPage, 'due')
    await listPaymentPlanBills(filterOf(1), opts, firstPage, 'overdue')
    await listPaymentPlanBills(filterOf(1), opts, { ...firstPage, sortBy: 'balance', sortDir: 'desc' }, 'due')
    expect(apOpenInvoices).toHaveBeenCalledTimes(1)
  })
})
