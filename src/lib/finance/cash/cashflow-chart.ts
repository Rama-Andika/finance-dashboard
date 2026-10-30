import type { Lang, Money } from '../../core/types'
import { formatMonth } from '../../format/date'

export type CashflowMonthData = {
  month: string // 'YYYY-MM'
  cashIn: Money
  cashOut: Money
}

/** One month as the chart draws it: cash in above the axis, cash out below, plus the exact amounts for the tooltip. */
export type CashflowChartRow = {
  monthKey: string
  displayMonth: string
  cashInNum: number
  cashOutNum: number
  rawIn: Money
  rawOut: Money
}

/**
 * The chart's coordinates are plain numbers (a drawing needs no exact decimals); the exact money strings travel
 * along as `rawIn` / `rawOut` and are what the tooltip shows.
 */
export function buildCashflowChartRows(data: readonly CashflowMonthData[], lang: Lang): CashflowChartRow[] {
  return data.map((d) => ({
    monthKey: d.month,
    displayMonth: formatMonth(d.month, lang),
    cashInNum: Math.abs(Number(d.cashIn) || 0),
    cashOutNum: -Math.abs(Number(d.cashOut) || 0),
    rawIn: d.cashIn,
    rawOut: d.cashOut,
  }))
}

/** The month with the most cash moving (in plus out); '' when there is no month. The first one wins a tie. */
export function peakMonthOf(rows: readonly CashflowChartRow[]): string {
  let peak = ''
  let peakValue = -1
  for (const row of rows) {
    const total = row.cashInNum + Math.abs(row.cashOutNum)
    if (total > peakValue) {
      peakValue = total
      peak = row.monthKey
    }
  }
  return peak
}

/** "Jan" for one month, "Jan – Mar" for a range; '' when there is no data. */
export function monthRangeLabel(data: readonly CashflowMonthData[], lang: Lang): string {
  const first = data[0]?.month
  const last = data[data.length - 1]?.month
  if (!first || !last) return ''
  return first === last ? formatMonth(first, lang) : `${formatMonth(first, lang)} – ${formatMonth(last, lang)}`
}
