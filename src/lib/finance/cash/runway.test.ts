import { describe, expect, it } from 'vitest'
import {
  computeAvgBurn,
  computeRunway,
  computeRatios,
} from './runway'

describe('runway and financial ratios logic', () => {
  it('identifies cash flow positive when net burn is positive or zero', () => {
    const avgBurn = computeAvgBurn(['100.00', '200.00', '50.00'])
    expect(avgBurn).toBe('116.67')

    const runway = computeRunway('1000.00', avgBurn)
    expect(runway.cashFlowPositive).toBe(true)
    expect(runway.runwayMonths).toBeNull()
  })

  it('computes runway months accurately when burning cash', () => {
    // AvgBurn -100 and cash 1000 -> 10.0 months
    const avgBurn = computeAvgBurn(['-150.00', '-50.00', '-100.00'])
    expect(avgBurn).toBe('-100.00')

    const runway = computeRunway('1000.00', avgBurn)
    expect(runway.cashFlowPositive).toBe(false)
    expect(runway.runwayMonths).toBe('10.0')
  })

  it('computes gross margin, net margin, and current ratio with zero divisor handling', () => {
    // Revenue 1000, Gross Profit 400, Net Profit 200, Liquid Assets 1500, Current Liabilities 1000
    const ratios1 = computeRatios({
      revenue: '1000.00',
      grossProfit: '400.00',
      netProfit: '200.00',
      liquidAssets: '1500.00',
      currentLiabilities: '1000.00',
    })

    expect(ratios1.grossMargin).toBe('40.0%')
    expect(ratios1.netMargin).toBe('20.0%')
    expect(ratios1.currentRatio).toBe('1.50')

    // Divisors 0 -> null
    const ratiosZero = computeRatios({
      revenue: '0.00',
      grossProfit: '0.00',
      netProfit: '0.00',
      liquidAssets: '500.00',
      currentLiabilities: '0.00',
    })

    expect(ratiosZero.grossMargin).toBeNull()
    expect(ratiosZero.netMargin).toBeNull()
    expect(ratiosZero.currentRatio).toBeNull()
  })
})
