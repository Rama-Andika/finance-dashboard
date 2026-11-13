import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The Summary services only gather the other metrics and pick figures out of them. These tests mock every metric, so
 * they check what is taken, what is left out, and that the three parts of the page carry the same figures.
 */

vi.mock('~/server/context', () => ({ buildMetricMeta: () => ({ meta: true }) }))
vi.mock('~/lib/finance/pnl/operating-expense', () => ({
  buildOperatingExpenseFolders: (lines: unknown) => ({ expenseFoldersOf: lines }),
}))

const computeCashPosition = vi.fn()
const computeRevenue = vi.fn()
const computePnl = vi.fn()
const computeApAging = vi.fn()
const computeCashFlow = vi.fn()
const computeRunwayMetrics = vi.fn()
const computePaymentPlan = vi.fn()
const computeFixedCost = vi.fn()
vi.mock('~/server/services/cash/cash-position.service', () => ({
  computeCashPosition: (...args: unknown[]) => computeCashPosition(...args),
}))
vi.mock('~/server/services/pnl/revenue.service', () => ({
  computeRevenue: (...args: unknown[]) => computeRevenue(...args),
}))
vi.mock('~/server/services/pnl/pnl.service', () => ({
  computePnl: (...args: unknown[]) => computePnl(...args),
}))
vi.mock('~/server/services/ap-ar/ap-aging.service', () => ({
  computeApAging: (...args: unknown[]) => computeApAging(...args),
}))
vi.mock('~/server/services/cash/cash-flow.service', () => ({
  computeCashFlow: (...args: unknown[]) => computeCashFlow(...args),
}))
vi.mock('~/server/services/cash/runway.service', () => ({
  computeRunwayMetrics: (...args: unknown[]) => computeRunwayMetrics(...args),
}))
vi.mock('~/server/services/ap-ar/payment-plan.service', () => ({
  computePaymentPlan: (...args: unknown[]) => computePaymentPlan(...args),
}))
vi.mock('~/server/services/pnl/fixed-cost.service', () => ({
  computeFixedCost: (...args: unknown[]) => computeFixedCost(...args),
}))

const { computeSummary, computeSummaryHead, computeSummaryCharts, computeSummaryMini } =
  await import('./summary.service')

const filter = { entityCount: 3 } as never

const cashPosition = {
  cashPosition: '1000.00',
  compare: { cashPosition: '900.00' },
  cash: '100.00',
  bank: '800.00',
  deposit: '50.00',
  inTransit: '50.00',
  giroOutstanding: '10.00',
  byEntity: [{ code: 'A', name: 'Must not leak', amount: '1.00', isNegative: false }],
}
const revenue = {
  total: '5000.00',
  compareTotal: '4000.00',
  trend: [{ month: '2026-10', amount: '5000.00' }],
  byFolder: [{ name: 'Sales', amount: '5000.00' }],
  byEntity: [{ id: 'locA', code: 'A', name: 'Store A', amount: '5000.00' }],
  entityUnassigned: '0.00',
}
const pnlLines = [
  { key: 'grossProfit', amount: '3000.00', margin: '0.6' },
  { key: 'operatingProfit', amount: '2000.00', margin: '0.4' },
  { key: 'netProfit', amount: '1500.00', margin: '0.3' },
]
const apAging = {
  total: '700.00',
  unpaidBills: '650.00',
  overdueSubtotal: '120.00',
  overdueBills: '100.00',
  byVendor: [{ vendorId: 'v1', name: 'Must not leak' }],
}
const cashFlow = {
  netCashFlow: '250.00',
  closingCash: '1000.00',
  monthly: [{ month: '2026-10', cashIn: '400.00', cashOut: '150.00', net: '250.00' }],
  drawers: ['Must not leak'],
}
const runway = {
  runwayMonths: '5.0',
  cashFlowPositive: false,
  avgBurn: '-200.00',
  currentRatio: '2.00',
  grossMargin: '0.6',
}
const paymentPlan = {
  openingBalance: '1000.00',
  overdue: '40.00',
  days: [{ date: '2026-10-15', outflow: '140.00', closing: '860.00', isNegative: false, status: { approved: '1.00' } }],
  bills: [{ invoiceId: 'Must not leak' }],
}
const fixedCost = { byFolder: [{ name: 'Rent', amount: '300.00' }], basketEmpty: false }

describe('Summary services', () => {
  beforeEach(() => {
    for (const m of [
      computeCashPosition,
      computeRevenue,
      computePnl,
      computeApAging,
      computeCashFlow,
      computeRunwayMetrics,
      computePaymentPlan,
      computeFixedCost,
    ])
      m.mockReset()
    computeCashPosition.mockResolvedValue(cashPosition)
    computeRevenue.mockResolvedValue(revenue)
    computePnl.mockResolvedValue({ lines: pnlLines })
    computeApAging.mockResolvedValue(apAging)
    computeCashFlow.mockResolvedValue(cashFlow)
    computeRunwayMetrics.mockResolvedValue(runway)
    computePaymentPlan.mockResolvedValue(paymentPlan)
    computeFixedCost.mockResolvedValue(fixedCost)
  })

  describe('computeSummary', () => {
    it('gathers every metric and keeps only the figures the page shows', async () => {
      const result = await computeSummary(filter)
      expect(result).toEqual({
        meta: { meta: true },
        cashPosition: {
          total: '1000.00',
          compare: '900.00',
          cash: '100.00',
          bank: '800.00',
          deposit: '50.00',
          inTransit: '50.00',
          giroOutstanding: '10.00',
          entityCount: 3,
        },
        revenue: {
          total: '5000.00',
          compare: '4000.00',
          trend: revenue.trend,
          byFolder: revenue.byFolder,
          byEntity: revenue.byEntity,
          entityUnassigned: '0.00',
        },
        expenseFolders: { expenseFoldersOf: pnlLines },
        fixedCostFolders: fixedCost.byFolder,
        fixedCostBasketEmpty: false,
        pnl: {
          grossProfit: '3000.00',
          grossMargin: '0.6',
          operatingProfit: '2000.00',
          operatingMargin: '0.4',
          netProfit: '1500.00',
          netMargin: '0.3',
        },
        apAging: { total: '700.00', unpaidBills: '650.00', overdueSubtotal: '120.00', overdueBills: '100.00' },
        cashFlow: { netCashFlow: '250.00', closingCash: '1000.00', monthly: cashFlow.monthly },
        runway: { runwayMonths: '5.0', cashFlowPositive: false, avgBurn: '-200.00', currentRatio: '2.00' },
        paymentPlan7Days: {
          openingBalance: '1000.00',
          overdue: '40.00',
          days: [{ date: '2026-10-15', outflow: '140.00', closing: '860.00', isNegative: false }],
        },
      })
    })

    it('asks for the cash position without the per-entity split, and for a 7 day plan without inflows', async () => {
      await computeSummary(filter)
      expect(computeCashPosition).toHaveBeenCalledWith(filter, { includeByEntity: false })
      expect(computePaymentPlan).toHaveBeenCalledWith(filter, { horizon: '7', inflow: false })
    })

    it('shows zero profit and no margin for a P&L line that is missing', async () => {
      computePnl.mockResolvedValue({ lines: [] })
      const result = await computeSummary(filter)
      expect(result.pnl).toEqual({
        grossProfit: '0.00',
        grossMargin: null,
        operatingProfit: '0.00',
        operatingMargin: null,
        netProfit: '0.00',
        netMargin: null,
      })
    })
  })

  describe('computeSummaryHead', () => {
    it('returns the four top cards and reads nothing else', async () => {
      const head = await computeSummaryHead(filter)
      expect(Object.keys(head).sort()).toEqual(['apAging', 'cashPosition', 'meta', 'pnl', 'revenue'])
      expect(head.revenue).toEqual({ total: '5000.00', compare: '4000.00' })
      expect(head.pnl).toEqual({ netProfit: '1500.00', netMargin: '0.3' })
      for (const unused of [computeCashFlow, computeRunwayMetrics, computePaymentPlan, computeFixedCost]) {
        expect(unused).not.toHaveBeenCalled()
      }
    })

    it('shows zero net profit and no margin when the P&L has no net profit line', async () => {
      computePnl.mockResolvedValue({ lines: [] })
      expect((await computeSummaryHead(filter)).pnl).toEqual({ netProfit: '0.00', netMargin: null })
    })

    it('carries the same cash position and payables figures as the whole summary', async () => {
      const head = await computeSummaryHead(filter)
      const whole = await computeSummary(filter)
      expect(head.cashPosition).toEqual(whole.cashPosition)
      expect(head.apAging).toEqual(whole.apAging)
    })
  })

  describe('computeSummaryCharts', () => {
    it('returns the cash flow chart and the donut figures, and reads neither cash position nor payables', async () => {
      const charts = await computeSummaryCharts(filter)
      expect(charts).toEqual({
        cashFlow: { netCashFlow: '250.00', closingCash: '1000.00', monthly: cashFlow.monthly },
        revenueByFolder: revenue.byFolder,
        revenueByEntity: revenue.byEntity,
        entityUnassigned: '0.00',
        expenseFolders: { expenseFoldersOf: pnlLines },
        fixedCostFolders: fixedCost.byFolder,
        fixedCostBasketEmpty: false,
      })
      expect(computeCashPosition).not.toHaveBeenCalled()
      expect(computeApAging).not.toHaveBeenCalled()
    })

    it('carries the same cash flow and donut figures as the whole summary', async () => {
      const charts = await computeSummaryCharts(filter)
      const whole = await computeSummary(filter)
      expect(charts.cashFlow).toEqual(whole.cashFlow)
      expect(charts.revenueByFolder).toEqual(whole.revenue.byFolder)
      expect(charts.expenseFolders).toEqual(whole.expenseFolders)
    })
  })

  describe('computeSummaryMini', () => {
    it('returns the runway and the two margins', async () => {
      expect(await computeSummaryMini(filter)).toEqual({
        runway: { runwayMonths: '5.0', cashFlowPositive: false, avgBurn: '-200.00', currentRatio: '2.00' },
        grossMargin: '0.6',
        netMargin: '0.3',
      })
    })

    it('has no margins when the P&L lines are missing', async () => {
      computePnl.mockResolvedValue({ lines: [] })
      const mini = await computeSummaryMini(filter)
      expect(mini.grossMargin).toBeNull()
      expect(mini.netMargin).toBeNull()
    })

    it('carries the same runway as the whole summary', async () => {
      const mini = await computeSummaryMini(filter)
      const whole = await computeSummary(filter)
      expect(mini.runway).toEqual(whole.runway)
    })
  })
})
