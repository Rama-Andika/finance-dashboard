import { describe, expect, it } from 'vitest'
import { runwayLabel } from './runway-label'

const t = (key: string) => `[${key}]`

describe('runwayLabel', () => {
  it('shows a dash without runway data', () => {
    expect(runwayLabel(t, undefined)).toBe('—')
  })

  it('says positive when cash flow is positive, whatever the months are', () => {
    expect(runwayLabel(t, { cashFlowPositive: true, runwayMonths: '3.0' })).toBe('[metric.runwayPositive]')
  })

  it('shows the months, or a dash when there are none', () => {
    expect(runwayLabel(t, { cashFlowPositive: false, runwayMonths: '4.5' })).toBe('4.5 [metric.months]')
    expect(runwayLabel(t, { cashFlowPositive: false, runwayMonths: null })).toBe('—')
  })
})
