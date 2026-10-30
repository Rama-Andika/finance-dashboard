import Decimal from 'decimal.js'
import { D, safeDiv } from '../../core/money'
import type { Money } from '../../core/types'

export type RunwayRatioResult = {
  runwayMonths: string | null
  cashFlowPositive: boolean
  avgBurn: Money
  grossMargin: string | null
  netMargin: string | null
  currentRatio: string | null
}

/**
 * Computes average burn of the last 3 full months.
 */
export function computeAvgBurn(last3MonthsNet: Money[]): Money {
  if (last3MonthsNet.length === 0) return '0.00'
  let total = D(0)
  for (const n of last3MonthsNet) {
    total = total.plus(D(n))
  }
  return total.div(last3MonthsNet.length).toFixed(2)
}

/**
 * Computes runway months. If avgBurn >= 0, cash flow is positive (runway = null, cashFlowPositive = true).
 * If avgBurn < 0, runway = cashPosition / |avgBurn| with 1 decimal.
 */
export function computeRunway(
  cashPosition: Money,
  avgBurn: Money,
): { runwayMonths: string | null; cashFlowPositive: boolean } {
  const burn = D(avgBurn)
  if (burn.gte(0)) {
    return {
      runwayMonths: null,
      cashFlowPositive: true,
    }
  }

  const cash = D(cashPosition)
  if (cash.lte(0)) {
    return {
      runwayMonths: '0.0',
      cashFlowPositive: false,
    }
  }

  const months = cash.div(burn.abs())
  return {
    runwayMonths: months.toFixed(1),
    cashFlowPositive: false,
  }
}

/**
 * Computes margins (Gross & Net margin) and Current ratio.
 */
export function computeRatios(input: {
  revenue: Money
  grossProfit: Money
  netProfit: Money
  liquidAssets: Money
  currentLiabilities: Money
}): {
  grossMargin: string | null
  netMargin: string | null
  currentRatio: string | null
} {
  const { revenue, grossProfit, netProfit, liquidAssets, currentLiabilities } = input

  // Margins
  const revD = D(revenue)
  let grossMargin: string | null = null
  let netMargin: string | null = null

  if (!revD.isZero()) {
    const gmRatio = safeDiv(grossProfit, revenue)
    grossMargin = gmRatio

    const nmRatio = safeDiv(netProfit, revenue)
    netMargin = nmRatio
  }

  // Current ratio = Liquid Assets / Current Liabilities
  const clD = D(currentLiabilities)
  let currentRatio: string | null = null
  if (!clD.isZero()) {
    const cr = D(liquidAssets).div(clD.abs())
    currentRatio = cr.toFixed(2)
  }

  return {
    grossMargin,
    netMargin,
    currentRatio,
  }
}
