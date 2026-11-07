import { beforeEach, describe, expect, it, vi } from 'vitest'
import { sum } from '~/lib/core/money'
import { filterBillsByScope } from '~/lib/finance/ap-ar/payment-plan-bills'
import type { ApOpenInvoiceRow, ArDirectReturnRow, ArOpenInvoiceRow } from '~/server/repo/ap-ar/aging.repo'

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
const agingDueTotals = vi.fn()
const agingCreditData = vi.fn()
const apOpenInvoices = vi.fn()
const arOpenInvoices = vi.fn()
const arDirectReturns = vi.fn()
vi.mock('~/server/repo/ap-ar/aging.repo', () => ({
  agingDueTotals: (...args: unknown[]) => agingDueTotals(...args),
  agingCreditData: (...args: unknown[]) => agingCreditData(...args),
  apOpenInvoices: (...args: unknown[]) => apOpenInvoices(...args),
  arOpenInvoices: (...args: unknown[]) => arOpenInvoices(...args),
  arDirectReturns: (...args: unknown[]) => arDirectReturns(...args),
}))
const listActivePlanStatuses = vi.fn()
vi.mock('~/server/repo/ap-ar/payment-plan.repo', () => ({
  listActivePlanStatuses: (...args: unknown[]) => listActivePlanStatuses(...args),
}))
vi.mock('~/server/repo/ap-ar/party.repo', () => ({ listVendors: async () => [] }))
vi.mock('~/server/repo/cash/bank-payment.repo', () => ({
  unsettledByChannel: async () => [],
  settlementLag: async () => [],
}))

const { computePaymentPlan, computePaymentPlanSummary } = await import('./payment-plan.service')
const { clearCache } = await import('~/server/cache')

const TODAY = '2026-06-15'
const filter = {
  today: TODAY,
  locationIds: 'all',
  segmentDetailIds: 'all',
  entitySegmentColumn: 'segment1_id',
} as never
const opts = { horizon: '7' as const, inflow: false }

describe('Payment Plan two-path credit parity', () => {
  beforeEach(() => {
    for (const m of [
      computeCashPosition,
      agingDueTotals,
      agingCreditData,
      apOpenInvoices,
      arOpenInvoices,
      arDirectReturns,
      listActivePlanStatuses,
    ])
      m.mockReset()
    clearCache()
    computeCashPosition.mockResolvedValue({ cashPosition: '5000.00' })
    listActivePlanStatuses.mockResolvedValue([])
  })

  it('yields identical schedule, overdue, and creditsApplied between list and summary paths', async () => {
    // Dataset:
    // v1 @ l1:
    //   b1_0: overdue 2026-06-08, 20.00
    //   b1_1: overdue 2026-06-10, 50.00
    //   b1_2: due 2026-06-16, 80.00
    //   b1_3: due 2026-06-18, 50.00
    //   c1_1: credit -30.00
    //   c1_2: credit -60.00 (pool = 90.00; covers b1_0 (20), b1_1 (50), and 20 of b1_2)
    // v2 @ l1:
    //   b2_1: due 2026-06-16, 40.00
    //   c2_1: credit -50.00 (pool = 50.00 > bill 40.00, caps at 40.00)
    // v3 @ l1:
    //   b3_0: overdue 2026-06-12, 35.00 (no credit)
    //   b3_1: due 2026-06-18, 75.00 (no credit)
    // outside horizon:
    //   b_out: due 2026-06-30, 200.00
    const rawRows: ApOpenInvoiceRow[] = [
      {
        invoiceId: 'b1_0',
        vendorId: 'v1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-08',
        dueDate: '2026-06-08',
        itemType: 1,
        originalAmount: '20.00',
        balance: '20.00',
      },
      {
        invoiceId: 'b1_1',
        vendorId: 'v1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-10',
        dueDate: '2026-06-10',
        itemType: 1,
        originalAmount: '50.00',
        balance: '50.00',
      },
      {
        invoiceId: 'b1_2',
        vendorId: 'v1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-16',
        dueDate: '2026-06-16',
        itemType: 1,
        originalAmount: '80.00',
        balance: '80.00',
      },
      {
        invoiceId: 'b1_3',
        vendorId: 'v1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-18',
        dueDate: '2026-06-18',
        itemType: 1,
        originalAmount: '50.00',
        balance: '50.00',
      },
      {
        invoiceId: 'c1_1',
        vendorId: 'v1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-01',
        dueDate: '2026-06-01',
        itemType: 1,
        originalAmount: '-30.00',
        balance: '-30.00',
      },
      {
        invoiceId: 'c1_2',
        vendorId: 'v1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-05',
        dueDate: '2026-06-05',
        itemType: 1,
        originalAmount: '-60.00',
        balance: '-60.00',
      },
      {
        invoiceId: 'b2_1',
        vendorId: 'v2',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-16',
        dueDate: '2026-06-16',
        itemType: 1,
        originalAmount: '40.00',
        balance: '40.00',
      },
      {
        invoiceId: 'c2_1',
        vendorId: 'v2',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-02',
        dueDate: '2026-06-02',
        itemType: 1,
        originalAmount: '-50.00',
        balance: '-50.00',
      },
      {
        invoiceId: 'b3_0',
        vendorId: 'v3',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-12',
        dueDate: '2026-06-12',
        itemType: 1,
        originalAmount: '35.00',
        balance: '35.00',
      },
      {
        invoiceId: 'b3_1',
        vendorId: 'v3',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-18',
        dueDate: '2026-06-18',
        itemType: 1,
        originalAmount: '75.00',
        balance: '75.00',
      },
      {
        invoiceId: 'b_out',
        vendorId: 'v1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-30',
        dueDate: '2026-06-30',
        itemType: 1,
        originalAmount: '200.00',
        balance: '200.00',
      },
    ]

    // 1. Run list path
    apOpenInvoices.mockResolvedValue(rawRows)
    const plan = await computePaymentPlan(filter, opts)

    // Clear cache between calls to test independent computation
    clearCache()

    // 2. Setup summary path mocks
    // Gross due totals for bills due <= 2026-06-21:
    // 2026-06-08: 20.00 (b1_0)
    // 2026-06-10: 50.00 (b1_1)
    // 2026-06-12: 35.00 (b3_0)
    // 2026-06-16: 120.00 (b1_2 80 + b2_1 40)
    // 2026-06-18: 125.00 (b1_3 50 + b3_1 75)
    agingDueTotals.mockImplementation(
      async (_side: string, _asOf: string, _loc: unknown, o: { invoiceIds?: string[] }) => {
        if (!o.invoiceIds)
          return new Map([
            ['2026-06-08', '20.00'],
            ['2026-06-10', '50.00'],
            ['2026-06-12', '35.00'],
            ['2026-06-16', '120.00'],
            ['2026-06-18', '125.00'],
          ])
        return new Map() // no vouchers
      },
    )
    agingCreditData.mockResolvedValue({
      pools: [
        { partyId: 'v1', locationId: 'l1', amount: '90.00' },
        { partyId: 'v2', locationId: 'l1', amount: '50.00' },
      ],
      bills: [
        { invoiceId: 'b1_0', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-08', balance: '20.00' },
        { invoiceId: 'b1_1', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '50.00' },
        { invoiceId: 'b1_2', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-16', balance: '80.00' },
        { invoiceId: 'b1_3', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-18', balance: '50.00' },
        { invoiceId: 'b2_1', partyId: 'v2', locationId: 'l1', dueDate: '2026-06-16', balance: '40.00' },
      ],
    })

    const summary = await computePaymentPlanSummary(filter, opts)

    // Assert parity
    expect(summary.days).toEqual(plan.days)
    expect(summary.overdue).toBe(plan.overdue)
    expect(summary.creditsApplied).toBe(plan.creditsApplied)

    // Expected credits applied: 20 (b1_0) + 50 (b1_1) + 20 (b1_2) + 40 (b2_1) = 130.00
    expect(plan.creditsApplied).toBe('130.00')

    // Expected overdue: b1_0 & b1_1 wiped out by credits, leaving only b3_0 (35.00)
    expect(plan.overdue).toBe('35.00')

    // Sum of all rows (bills + credit rows) in tab overdue equals plan.overdue
    const overdueBills = filterBillsByScope(plan.bills, 'overdue')
    expect(sum(overdueBills.map((b) => b.balance))).toBe(plan.overdue)

    // Bill count on overdue tab counts only kind === 'bill', not credit rows
    const overdueGrossBills = overdueBills.filter((b) => b.kind === 'bill')
    const overdueCreditRows = overdueBills.filter((b) => b.kind === 'credit')
    expect(overdueGrossBills.length).toBe(3) // b1_0, b1_1, b3_0
    expect(overdueCreditRows.length).toBe(2) // credit for b1_0, credit for b1_1
  })

  it('yields identical daily inflows and inflowCreditsApplied between list and summary paths', async () => {
    // AR Dataset:
    // c1 @ l1:
    //   a1: due TODAY (2026-06-15), 100.00
    //   a2: due 2026-06-17, 50.00
    //   a_overdue: due 2026-06-10, 80.00 (overdue: does not absorb credit)
    //   ret1: direct return, -120.00 (pool = 120.00 covers a1 (100) and 20 of a2)
    // c2 @ l1:
    //   a3: due 2026-06-18, 40.00 (no credit)
    // c1 @ l2:
    //   ret_other: direct return, -30.00 (different entity, does not reduce l1)
    const rawAr: ArOpenInvoiceRow[] = [
      {
        invoiceId: 'a1',
        customerId: 'c1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-15',
        dueDate: '2026-06-15',
        itemType: 0,
        originalAmount: '100.00',
        balance: '100.00',
      },
      {
        invoiceId: 'a2',
        customerId: 'c1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-17',
        dueDate: '2026-06-17',
        itemType: 0,
        originalAmount: '50.00',
        balance: '50.00',
      },
      {
        invoiceId: 'a_overdue',
        customerId: 'c1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-10',
        dueDate: '2026-06-10',
        itemType: 0,
        originalAmount: '80.00',
        balance: '80.00',
      },
      {
        invoiceId: 'a3',
        customerId: 'c2',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-18',
        dueDate: '2026-06-18',
        itemType: 0,
        originalAmount: '40.00',
        balance: '40.00',
      },
    ]

    const directReturns: ArDirectReturnRow[] = [
      {
        cardId: 'ret1',
        customerId: 'c1',
        locationId: 'l1',
        coaId: 'c',
        txDate: '2026-05-01',
        balance: '-120.00',
      },
      {
        cardId: 'ret_other',
        customerId: 'c1',
        locationId: 'l2',
        coaId: 'c',
        txDate: '2026-05-01',
        balance: '-30.00',
      },
    ]

    // 1. Run list path
    apOpenInvoices.mockResolvedValue([])
    arOpenInvoices.mockResolvedValue(rawAr)
    arDirectReturns.mockResolvedValue(directReturns)

    const plan = await computePaymentPlan(filter, { horizon: '7', inflow: true })

    clearCache()

    // 2. Setup summary path mocks
    agingDueTotals.mockImplementation(async (side: string) => {
      if (side === 'ar')
        return new Map([
          ['2026-06-15', '100.00'],
          ['2026-06-17', '50.00'],
          ['2026-06-18', '40.00'],
        ])
      return new Map()
    })
    agingCreditData.mockImplementation(async (side: string) => {
      if (side === 'ar') {
        return {
          pools: [
            { partyId: 'c1', locationId: 'l1', amount: '120.00' },
            { partyId: 'c1', locationId: 'l2', amount: '30.00' },
          ],
          bills: [
            { invoiceId: 'a1', partyId: 'c1', locationId: 'l1', dueDate: '2026-06-15', balance: '100.00' },
            { invoiceId: 'a2', partyId: 'c1', locationId: 'l1', dueDate: '2026-06-17', balance: '50.00' },
          ],
        }
      }
      return { pools: [], bills: [] }
    })

    const summary = await computePaymentPlanSummary(filter, { horizon: '7', inflow: true })

    // Assert daily inflow parity
    expect(summary.days.map((d) => d.inflow)).toEqual(plan.days.map((d) => d.inflow))
    expect(summary.inflowCreditsApplied).toBe(plan.inflowCreditsApplied)
    expect(plan.inflowCreditsApplied).toBe('120.00')

    // Day 0: 100 - 100 = 0
    expect(plan.days[0]?.inflow).toBe('0.00')
    // Day 2 (2026-06-17): 50 - 20 = 30
    expect(plan.days.find((d) => d.date === '2026-06-17')?.inflow).toBe('30.00')
    // Day 3 (2026-06-18): 40 (no credit)
    expect(plan.days.find((d) => d.date === '2026-06-18')?.inflow).toBe('40.00')
  })
});
