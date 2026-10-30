import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip as RechartsTooltip,
} from 'recharts'
import type { Lang, Money } from '~/lib/core/types'
import { buildCashflowChartRows, type CashflowMonthData } from '~/lib/finance/cash/cashflow-chart'
import { formatAxisShort } from '~/lib/format/number'
import { CashflowSummary, CashflowTooltip, monthCells, useCashflowChartLabels } from './CashflowChartParts'

export type { CashflowMonthData }

export type CashflowChartProps = {
  title: string
  data: CashflowMonthData[]
  net: Money
  lang: Lang
  selectedMonth?: string
  onSelectMonth?: (month: string) => void
}

export function CashflowChart({ title, data, net, lang, selectedMonth, onSelectMonth }: CashflowChartProps) {
  const chartData = buildCashflowChartRows(data, lang)
  // The period shown is the one picked in the top bar; the chart just labels it.
  const { rangeLabel, ariaLabel } = useCashflowChartLabels(data, chartData, lang)

  return (
    <section className="nr-card" style={{ width: '100%' }}>
      <div className="nr-card-head">
        <h3 className="nr-card-title">{title}</h3>
      </div>

      <CashflowSummary rangeLabel={rangeLabel} net={net} lang={lang} />

      <div className="cf-wrap" style={{ width: '100%', height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={chartData}
            stackOffset="sign"
            margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
            onClick={(state) => {
              const index = Number(state.activeTooltipIndex)
              const month = Number.isInteger(index) ? chartData[index]?.monthKey : undefined
              if (month && onSelectMonth) onSelectMonth(month)
            }}
            role="img"
            aria-label={ariaLabel}
          >
            <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="displayMonth"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--ink-muted)', fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
              tickFormatter={(v) => formatAxisShort(v, lang)}
            />
            <ReferenceLine y={0} stroke="var(--chart-axis)" />
            <RechartsTooltip
              cursor={{ fill: 'var(--lime-soft)', opacity: 0.5, rx: 6 }}
              content={({ active, payload }) => <CashflowTooltip active={active} payload={payload} lang={lang} />}
            />
            <Bar
              dataKey="cashInNum"
              name="cashIn"
              fill="var(--chart-income)"
              radius={[4, 4, 0, 0]}
              animationDuration={300}
            >
              {monthCells('in', 'var(--chart-income)', chartData, selectedMonth, Boolean(onSelectMonth))}
            </Bar>
            <Bar
              dataKey="cashOutNum"
              name="cashOut"
              fill="var(--chart-expense)"
              radius={[0, 0, 4, 4]}
              animationDuration={300}
            >
              {monthCells('out', 'var(--chart-expense)', chartData, selectedMonth, Boolean(onSelectMonth))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
