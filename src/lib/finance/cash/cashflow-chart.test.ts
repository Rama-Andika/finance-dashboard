import { describe, expect, it } from 'vitest'
import { buildCashflowChartRows, monthRangeLabel, peakMonthOf, type CashflowMonthData } from './cashflow-chart'

const data: CashflowMonthData[] = [
  { month: '2026-01', cashIn: '100.00', cashOut: '-40.00' },
  { month: '2026-02', cashIn: '300.00', cashOut: '250.00' },
  { month: '2026-03', cashIn: '0.00', cashOut: '0.00' },
]

describe('buildCashflowChartRows', () => {
  it('draws cash in above the axis and cash out below it, whatever sign the amount arrives with', () => {
    const rows = buildCashflowChartRows(data, 'en')
    expect(rows.map((r) => [r.cashInNum, r.cashOutNum])).toEqual([
      [100, -40],
      [300, -250],
      [0, -0],
    ])
  })

  it('keeps the exact money strings for the tooltip', () => {
    const [first] = buildCashflowChartRows(data, 'en')
    expect(first).toMatchObject({ monthKey: '2026-01', rawIn: '100.00', rawOut: '-40.00' })
  })

  it('treats an unreadable amount as zero', () => {
    const [row] = buildCashflowChartRows([{ month: '2026-01', cashIn: '', cashOut: 'abc' }], 'en')
    expect(row?.cashInNum).toBe(0)
    expect(Math.abs(row?.cashOutNum ?? 1)).toBe(0)
  })
})

describe('peakMonthOf', () => {
  it('returns the month with the most cash moving', () => {
    expect(peakMonthOf(buildCashflowChartRows(data, 'en'))).toBe('2026-02')
  })

  it('returns an empty string without months, and the first month on a tie', () => {
    expect(peakMonthOf([])).toBe('')
    const tie = buildCashflowChartRows(
      [
        { month: '2026-01', cashIn: '10', cashOut: '10' },
        { month: '2026-02', cashIn: '10', cashOut: '10' },
      ],
      'en',
    )
    expect(peakMonthOf(tie)).toBe('2026-01')
  })
})

describe('monthRangeLabel', () => {
  it('names a single month, or the first and last month of a range', () => {
    expect(monthRangeLabel([data[0]!], 'en')).toBe('Jan')
    expect(monthRangeLabel(data, 'en')).toBe('Jan – Mar')
  })

  it('is empty without data', () => {
    expect(monthRangeLabel([], 'en')).toBe('')
  })
})
