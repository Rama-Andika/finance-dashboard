import '@tanstack/react-start/server-only'
import type { Breakdown, MetricMeta, Money } from '~/lib/finance/types'
import { type AppContextFilter, buildMetricMeta } from '~/server/context'
import { computeCashPosition } from '~/server/services/cash-position.service'
import { computeRevenue } from '~/server/services/revenue.service'
import { computePnl } from '~/server/services/pnl.service'
import { computeApAging } from '~/server/services/ap-aging.service'
import { computeCashFlow } from '~/server/services/cash-flow.service'
import { computeRunwayMetrics } from '~/server/services/runway.service'
import {
  computePaymentPlan,
  type PaymentPlanBill,
} from '~/server/services/payment-plan.service'
import { computeFixedCost } from '~/server/services/fixed-cost.service'

export type SummaryResult = {
  meta: MetricMeta
  cashPosition: {
    total: Money
    compare: Money | null
    cash: Money
    bank: Money
    deposit: Money
    inTransit: Money
    entityCount?: number
  }
  revenue: {
    total: Money
    compare: Money | null
    trend: Array<{ month: string; amount: Money }>
    byFolder: Breakdown[]
  }
  expenseFolders: Breakdown[]
  pnl: {
    grossProfit: Money
    grossMargin: string | null
    operatingProfit: Money
    operatingMargin: string | null
    netProfit: Money
    netMargin: string | null
    comprehensiveIncome: Money
  }
  apAging: {
    total: Money
    unpaidBills: Money
    overdueSubtotal: Money
  }
  cashFlow: {
    netCashFlow: Money
    closingCash: Money
    monthly: Array<{ month: string; cashIn: Money; cashOut: Money; net: Money }>
  }
  runway: {
    runwayMonths: string | null
    cashFlowPositive: boolean
    avgBurn: Money
    currentRatio: string | null
  }
  paymentPlan7Days: {
    openingBalance: Money
    overdue: Money
    days: Array<{
      date: string
      outflow: Money
      closing: Money
      isNegative: boolean
    }>
    bills: PaymentPlanBill[]
  }
}

export async function computeSummary(
  filter: AppContextFilter,
): Promise<SummaryResult> {
  const meta = buildMetricMeta(filter)

  const [
    cashPos,
    revenue,
    pnl,
    apAging,
    cashFlow,
    runway,
    paymentPlan,
    fixedCost,
  ] = await Promise.all([
    computeCashPosition(filter, { includeByEntity: false }),
    computeRevenue(filter),
    computePnl(filter),
    computeApAging(filter),
    computeCashFlow(filter),
    computeRunwayMetrics(filter),
    computePaymentPlan(filter, { horizon: '7', inflow: false }),
    computeFixedCost(filter),
  ])

  const pnlMap = new Map(pnl.lines.map((l) => [l.key, l]))
  const gpLine = pnlMap.get('grossProfit')
  const opLine = pnlMap.get('operatingProfit')
  const npLine = pnlMap.get('netProfit')
  const compLine = pnlMap.get('comprehensiveIncome')

  return {
    meta,
    cashPosition: {
      total: cashPos.cashPosition,
      compare: cashPos.compare.cashPosition,
      cash: cashPos.cash,
      bank: cashPos.bank,
      deposit: cashPos.deposit,
      inTransit: cashPos.inTransit,
      entityCount: filter.entityCount,
    },
    revenue: {
      total: revenue.total,
      compare: revenue.compareTotal,
      trend: revenue.trend,
      byFolder: revenue.byFolder,
    },
    expenseFolders: fixedCost.byFolder,
    pnl: {
      grossProfit: gpLine?.amount ?? '0.00',
      grossMargin: gpLine?.margin ?? null,
      operatingProfit: opLine?.amount ?? '0.00',
      operatingMargin: opLine?.margin ?? null,
      netProfit: npLine?.amount ?? '0.00',
      netMargin: npLine?.margin ?? null,
      comprehensiveIncome: compLine?.amount ?? '0.00',
    },
    apAging: {
      total: apAging.total,
      unpaidBills: apAging.unpaidBills,
      overdueSubtotal: apAging.overdueSubtotal,
    },
    cashFlow: {
      netCashFlow: cashFlow.netCashFlow,
      closingCash: cashFlow.closingCash,
      monthly: cashFlow.monthly,
    },
    runway: {
      runwayMonths: runway.runwayMonths,
      cashFlowPositive: runway.cashFlowPositive,
      avgBurn: runway.avgBurn,
      currentRatio: runway.currentRatio,
    },
    paymentPlan7Days: {
      openingBalance: paymentPlan.openingBalance,
      overdue: paymentPlan.overdue,
      days: paymentPlan.days.map((d) => ({
        date: d.date,
        outflow: d.outflow,
        closing: d.closing,
        isNegative: d.isNegative,
      })),
      bills: paymentPlan.bills,
    },
  }
}
