import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ReferenceLine,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts'
import type { Lang } from '~/lib/core/types'
import type { Money } from '~/lib/core/types'
import { formatAxisShort, formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatMonth, formatMonthYear } from '~/lib/format/date'
import { useTranslation } from 'react-i18next'

export type CashflowMonthData = {
  month: string // 'YYYY-MM'
  cashIn: Money
  cashOut: Money
}

export type CashflowChartProps = {
  title: string
  data: CashflowMonthData[]
  net: Money
  lang: Lang
  selectedMonth?: string
  onSelectMonth?: (month: string) => void
}

export function CashflowChart({
  title,
  data,
  net,
  lang,
  selectedMonth,
  onSelectMonth,
}: CashflowChartProps) {
  const { t } = useTranslation()
  // Transform to numeric values for recharts coordinates
  const chartData = data.map((d) => {
    const rawIn = Math.abs(Number(d.cashIn) || 0)
    const rawOut = -Math.abs(Number(d.cashOut) || 0)
    return {
      monthKey: d.month,
      displayMonth: formatMonth(d.month, lang),
      cashInNum: rawIn,
      cashOutNum: rawOut,
      rawIn: d.cashIn,
      rawOut: d.cashOut,
    }
  })

  // Determine aria-label
  let maxMonth = ''
  let maxVal = -1
  for (const d of chartData) {
    const total = d.cashInNum + Math.abs(d.cashOutNum)
    if (total > maxVal) {
      maxVal = total
      maxMonth = d.monthKey
    }
  }

  // The period shown is the one picked in the top bar; the chart just labels it.
  const first = data[0]?.month
  const last = data[data.length - 1]?.month
  const monthRange = (a: string, b: string) =>
    a === b ? formatMonth(a, lang) : `${formatMonth(a, lang)} – ${formatMonth(b, lang)}`
  const rangeLabel = first && last ? monthRange(first, last) : ''

  const ariaLabel =
    t('ui.cashflowChart.ariaLabel', { range: rangeLabel, peak: maxMonth ? formatMonth(maxMonth, lang) : '-' })

  return (
    <section className="nr-card" style={{ width: '100%' }}>
      <div className="nr-card-head">
        <h3 className="nr-card-title">{title}</h3>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'space-between',
          gap: 'var(--space-4)',
          flexWrap: 'wrap',
          marginBottom: 'var(--space-3)',
        }}
      >
        <div>
          <span className="nr-muted" style={{ fontSize: '12px' }}>
            {rangeLabel}
          </span>
          <p
            style={{
              margin: '4px 0 0',
              fontSize: '28px',
              lineHeight: '32px',
              fontWeight: 600,
              letterSpacing: '-0.02em',
              fontVariantNumeric: 'tabular-nums',
            }}
          >
            <span style={{ fontSize: '16px', color: 'var(--ink-muted)', marginRight: '6px' }}>
              Rp
            </span>
            {formatMoneyShort(net, lang).replace(/^Rp\s*/, '')}
          </p>
        </div>
        <div className="nr-legend">
          <span>
            <i className="nr-sw-in"></i>
            {t('ui.cashflowChart.cashIn')}
          </span>
          <span>
            <i className="nr-sw-out"></i>
            {t('ui.cashflowChart.cashOut')}
          </span>
        </div>
      </div>

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
              content={({ active, payload }) => {
                if (!active || !payload || !payload.length) return null
                const item = payload[0]?.payload
                if (!item) return null
                const fullMonth = formatMonthYear(item.monthKey, lang)
                return (
                  <div className="nr-tooltip" role="tooltip">
                    <span className="nr-tooltip-title">{fullMonth}</span>
                    <span className="nr-tooltip-row">
                      <span>{t('ui.cashflowChart.cashIn')}</span>
                      <b>IDR {formatMoneyFull(item.rawIn, lang)}</b>
                    </span>
                    <span className="nr-tooltip-row">
                      <span>{t('ui.cashflowChart.cashOut')}</span>
                      <b>IDR {formatMoneyFull(item.rawOut, lang)}</b>
                    </span>
                  </div>
                )
              }}
            />
            <Bar
              dataKey="cashInNum"
              name="cashIn"
              fill="var(--chart-income)"
              radius={[4, 4, 0, 0]}
              animationDuration={300}
            >
              {chartData.map((entry) => (
                <Cell
                  key={`in-${entry.monthKey}`}
                  fill="var(--chart-income)"
                  stroke={entry.monthKey === selectedMonth ? 'var(--lime-strong)' : 'none'}
                  strokeWidth={entry.monthKey === selectedMonth ? 2 : 0}
                  style={{ cursor: onSelectMonth ? 'pointer' : 'default' }}
                />
              ))}
            </Bar>
            <Bar
              dataKey="cashOutNum"
              name="cashOut"
              fill="var(--chart-expense)"
              radius={[0, 0, 4, 4]}
              animationDuration={300}
            >
              {chartData.map((entry) => (
                <Cell
                  key={`out-${entry.monthKey}`}
                  fill="var(--chart-expense)"
                  stroke={entry.monthKey === selectedMonth ? 'var(--lime-strong)' : 'none'}
                  strokeWidth={entry.monthKey === selectedMonth ? 2 : 0}
                  style={{ cursor: onSelectMonth ? 'pointer' : 'default' }}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}
