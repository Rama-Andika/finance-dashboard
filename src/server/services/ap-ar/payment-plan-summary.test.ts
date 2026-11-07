import { beforeEach, describe, expect, it, vi } from 'vitest'

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
vi.mock('~/server/repo/ap-ar/aging.repo', () => ({
  agingDueTotals: (...args: unknown[]) => agingDueTotals(...args),
  agingCreditData: (...args: unknown[]) => agingCreditData(...args),
  apOpenInvoices: (...args: unknown[]) => apOpenInvoices(...args),
  arOpenInvoices: (...args: unknown[]) => arOpenInvoices(...args),
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

const { computePaymentPlanSummary } = await import('./payment-plan.service')
const { clearCache } = await import('~/server/cache')

const TODAY = '2026-06-15'
const filter = {
  today: TODAY,
  locationIds: 'all',
  segmentDetailIds: 'all',
  entitySegmentColumn: 'segment1_id',
} as never
const opts = { horizon: '7' as const, inflow: false }

describe('computePaymentPlanSummary', () => {
  beforeEach(() => {
    for (const m of [computeCashPosition, agingDueTotals, agingCreditData, apOpenInvoices, arOpenInvoices, listActivePlanStatuses])
      m.mockReset()
    clearCache()
    computeCashPosition.mockResolvedValue({ cashPosition: '1000.00' })
    agingCreditData.mockResolvedValue({ pools: [], bills: [] })
    listActivePlanStatuses.mockResolvedValue([
      { invoiceId: 'i1', status: 'Posted' },
      { invoiceId: 'i2', status: 'Not Posted' },
      { invoiceId: 'i3', status: 'Not Posted' },
      { invoiceId: 'i3', status: 'Partialy Paid' }, // one approved voucher makes the bill approved
    ])
  })

  it('builds the plan from totals per due date and splits them by voucher status', async () => {
    agingDueTotals.mockImplementation(
      async (_side: string, _asOf: string, _loc: unknown, o: { invoiceIds?: string[] }) => {
        if (!o.invoiceIds)
          return new Map([
            [TODAY, '100.00'],
            ['2026-06-10', '40.00'],
          ]) // all open bills; one date is overdue
        if (o.invoiceIds.includes('i1')) return new Map([[TODAY, '30.00']])
        return new Map() // submitted
      },
    )
    const plan = await computePaymentPlanSummary(filter, opts)

    // approved ids i1 and i3, submitted id i2
    const calls = agingDueTotals.mock.calls.map((c) => (c[3] as { invoiceIds?: string[] }).invoiceIds)
    expect(calls).toEqual(expect.arrayContaining([undefined, ['i1', 'i3'], ['i2']]))
    expect(apOpenInvoices).not.toHaveBeenCalled()

    expect(plan.openingBalance).toBe('1000.00')
    expect(plan.overdue).toBe('40.00')
    expect(plan.planStatusInUse).toBe(true)
    expect('bills' in plan).toBe(false)
    expect(plan.days[0]).toMatchObject({
      date: TODAY,
      outflow: '140.00', // 100 due today + 40 overdue
      status: { approved: '30.00', submitted: '0.00', notSubmitted: '110.00' },
    })
  })

  it('asks for bills due by the last day of the horizon only', async () => {
    agingDueTotals.mockResolvedValue(new Map())
    await computePaymentPlanSummary(filter, { horizon: '14', inflow: false })
    expect(agingDueTotals.mock.calls[0]?.[3]).toEqual({ maxDue: '2026-06-28' })
  })

  it('falls back to the per-invoice plan when the snapshot cannot answer for today', async () => {
    agingDueTotals.mockResolvedValue(null)
    apOpenInvoices.mockResolvedValue([])
    const plan = await computePaymentPlanSummary(filter, opts)
    expect(apOpenInvoices).toHaveBeenCalledTimes(1)
    expect(plan.openingBalance).toBe('1000.00')
    expect('bills' in plan).toBe(false)
  })

  it('reads the receivables per due date only when inflows are asked for', async () => {
    agingDueTotals.mockResolvedValue(new Map())
    await computePaymentPlanSummary(filter, { horizon: '7', inflow: true })
    const sides = agingDueTotals.mock.calls.map((c) => c[0])
    expect(sides).toContain('ar')
    const arCall = agingDueTotals.mock.calls.find((c) => c[0] === 'ar')
    expect(arCall?.[3]).toEqual({ minDue: TODAY, maxDue: '2026-06-21' })
  })

  it('takes vendor credits off the bills by due date and keeps the statuses', async () => {
    agingDueTotals.mockImplementation(
      async (_side: string, _asOf: string, _loc: unknown, o: { invoiceIds?: string[] }) => {
        if (!o.invoiceIds)
          return new Map([
            [TODAY, '100.00'],
            ['2026-06-10', '40.00'],
          ])
        if (o.invoiceIds.includes('i1')) return new Map([[TODAY, '30.00']])
        return new Map()
      },
    )
    agingCreditData.mockResolvedValue({
      pools: [{ partyId: 'v1', locationId: 'l1', amount: '30.00' }],
      bills: [{ invoiceId: 'i4', partyId: 'v1', locationId: 'l1', dueDate: '2026-06-10', balance: '40.00' }],
    })

    const plan = await computePaymentPlanSummary(filter, opts)

    expect(plan.overdue).toBe('10.00')
    expect(plan.days[0]?.outflow).toBe('110.00') // 100 due today + 10 overdue
    expect(plan.creditsApplied).toBe('30.00')
  })

  it('ignores credits when the snapshot cannot answer', async () => {
    agingDueTotals.mockImplementation(
      async (_side: string, _asOf: string, _loc: unknown, o: { invoiceIds?: string[] }) => {
        if (!o.invoiceIds)
          return new Map([
            [TODAY, '100.00'],
            ['2026-06-10', '40.00'],
          ])
        if (o.invoiceIds.includes('i1')) return new Map([[TODAY, '30.00']])
        return new Map()
      },
    )
    agingCreditData.mockResolvedValue(null)

    const plan = await computePaymentPlanSummary(filter, opts)

    expect(plan.overdue).toBe('40.00')
    expect(plan.days[0]?.outflow).toBe('140.00')
    expect(plan.creditsApplied).toBe('0.00')
  })
  it('takes customer credits off the projected receipts', async () => {
    agingDueTotals.mockImplementation(async (side: string) => {
      if (side === 'ar')
        return new Map([
          [TODAY, '100.00'],
          ['2026-06-17', '50.00'],
        ])
      return new Map()
    })
    agingCreditData.mockImplementation(async (side: string) => {
      if (side === 'ar') {
        return {
          pools: [{ partyId: 'c1', locationId: 'l1', amount: '120.00' }],
          bills: [
            { invoiceId: 'a1', partyId: 'c1', locationId: 'l1', dueDate: TODAY, balance: '100.00' },
            { invoiceId: 'a2', partyId: 'c1', locationId: 'l1', dueDate: '2026-06-17', balance: '50.00' },
          ],
        }
      }
      return { pools: [], bills: [] }
    })

    const plan = await computePaymentPlanSummary(filter, { horizon: '7', inflow: true })

    expect(plan.days[0]?.inflow).toBe('0.00') // 100 - 100
    expect(plan.days.find((d) => d.date === '2026-06-17')?.inflow).toBe('30.00') // 50 - 20
    expect(plan.inflowCreditsApplied).toBe('120.00')

    const arCreditCall = agingCreditData.mock.calls.find((c) => c[0] === 'ar')
    expect(arCreditCall?.[4]).toEqual({ minDue: TODAY, includeUnallocated: true })
  })
});
