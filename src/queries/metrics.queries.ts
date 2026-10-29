import { keepPreviousData, queryOptions } from '@tanstack/react-query'
import { qk } from '~/queries/keys'
import type { MetricInput, PaymentPlanSearch } from '~/lib/filters/search-schema'

import { getSummaryFn } from '~/functions/metrics/summary.fn'
import { getRevenueFn } from '~/functions/metrics/revenue.fn'
import { getCashPositionFn } from '~/functions/metrics/cash-position.fn'
import { getCashFlowFn } from '~/functions/metrics/cash-flow.fn'
import { getPnlFn } from '~/functions/metrics/pnl.fn'
import { getExpensePaidFn } from '~/functions/metrics/expense-paid.fn'
import { getApAgingFn } from '~/functions/metrics/ap-aging.fn'
import { getArAgingFn } from '~/functions/metrics/ar-aging.fn'
import { getFixedCostFn } from '~/functions/metrics/fixed-cost.fn'
import { getPaymentPlanFn } from '~/functions/metrics/payment-plan.fn'
import { getBudgetFn } from '~/functions/metrics/budget.fn'
import { getRunwayFn } from '~/functions/metrics/runway.fn'

export function summaryMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('summary', input),
    queryFn: () => getSummaryFn({ data: input }),
  })
}

export function revenueMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('revenue', input),
    queryFn: () => getRevenueFn({ data: input }),
  })
}

export function cashPositionMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('cashPosition', input),
    queryFn: () => getCashPositionFn({ data: input }),
  })
}

export function cashFlowMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('cashFlow', input),
    queryFn: () => getCashFlowFn({ data: input }),
  })
}

export function pnlMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('pnl', input),
    queryFn: () => getPnlFn({ data: input }),
  })
}

export function expensePaidMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('expensePaid', input),
    queryFn: () => getExpensePaidFn({ data: input }),
  })
}

export function apAgingMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('apAging', input),
    queryFn: () => getApAgingFn({ data: input }),
  })
}

export function arAgingMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('arAging', input),
    queryFn: () => getArAgingFn({ data: input }),
  })
}

import {
  getAgingPartiesFn,
  getAgingPartiesExportChunkFn,
  type AgingPartiesInput,
  type AgingPartiesExportChunkInput,
} from '~/functions/metrics/aging-parties.fn'

/** One page of the vendor / customer aging table; the previous page stays visible while the next one loads. */
export function agingPartiesOptions(input: AgingPartiesInput) {
  return queryOptions({
    queryKey: qk.metric('agingParties', input),
    queryFn: () => getAgingPartiesFn({ data: input }),
    placeholderData: keepPreviousData,
  })
}

import { getPaymentBillsFn, type PaymentBillsInput } from '~/functions/metrics/payment-bills.fn'

export function paymentBillsOptions(input: PaymentBillsInput) {
  return queryOptions({
    queryKey: qk.metric('paymentBills', input),
    queryFn: () => getPaymentBillsFn({ data: input }),
    placeholderData: keepPreviousData,
  })
}

import { fetchAllChunks } from '~/lib/table/export-chunks'
import { getPaymentBillsExportChunkFn, type PaymentBillsExportChunkInput } from '~/functions/metrics/payment-bills.fn'

export type PaymentBillsExportInput = Omit<PaymentBillsExportChunkInput, 'page'>

/** Every bill of the 7-day plan, loaded chunk by chunk so no single response hits the server function size limit. */
export function exportPaymentBills(input: PaymentBillsExportInput) {
  return fetchAllChunks((page) => getPaymentBillsExportChunkFn({ data: { ...input, page } }))
}

export type AgingPartiesExportInput = Omit<AgingPartiesExportChunkInput, 'page'>

/** Every vendor / customer row, loaded chunk by chunk so no single response hits the server function size limit. */
export function exportAgingParties(input: AgingPartiesExportInput) {
  return fetchAllChunks((page) => getAgingPartiesExportChunkFn({ data: { ...input, page } }))
}

export function fixedCostMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('fixedCost', input),
    queryFn: () => getFixedCostFn({ data: input }),
  })
}

export function paymentPlanMetricOptions(input: MetricInput & PaymentPlanSearch) {
  return queryOptions({
    queryKey: qk.metric('paymentPlan', input),
    queryFn: () => getPaymentPlanFn({ data: input }),
  })
}

export function budgetMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('budget', input),
    queryFn: () => getBudgetFn({ data: input }),
  })
}

export function runwayMetricOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.metric('runway', input),
    queryFn: () => getRunwayFn({ data: input }),
  })
}
