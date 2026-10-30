import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts'
import { formatAxisShort, formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatMonth, formatMonthYear } from '~/lib/format/date'
import type { Lang, Money } from '~/lib/core/types'

const CHART_HEIGHT = 260
/** Headroom above the tallest bar, and the axis top when every month is zero. */
const AXIS_HEADROOM = 1.15
const EMPTY_AXIS_MAX = 1_000_000

/** Revenue per month as bars; the card header shows the period total. */
export function MonthlyTrendChart({
  trend,
  total,
  lang,
}: {
  trend: Array<{ month: string; amount: Money }>
  total: Money
  lang: Lang
}) {
  const { t } = useTranslation()
  const chartData = trend.map((m) => ({
    month: m.month,
    displayMonth: formatMonth(m.month, lang),
    // Display only: recharts needs a JS number for bar height; the exact amount stays in `rawAmount`.
    amountNum: Math.max(0, Number(m.amount) || 0),
    rawAmount: m.amount,
  }))

  return (
    <div className="nr-card lg:col-span-2 space-y-4">
      <div className="nr-card-head" style={{ margin: 0 }}>
        <h3 className="nr-card-title">{t('ui.revenue.monthlyRevenueTrend')}</h3>
        <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
          {formatMoneyShort(total, lang)}
        </span>
      </div>

      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="displayMonth"
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickLine={false}
              tick={{ fill: 'var(--ink-muted)', fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
              tickFormatter={(val) => formatAxisShort(val, lang)}
              domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax * AXIS_HEADROOM : EMPTY_AXIS_MAX)]}
            />
            <RechartsTooltip
              cursor={{ fill: 'var(--surface-hover)' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null
                const item = payload[0]?.payload
                return (
                  <div className="nr-tooltip">
                    <div className="font-semibold">{formatMonthYear(item.month, lang)}</div>
                    <div className="tabular-nums font-semibold mt-1">{formatMoneyFull(item.rawAmount, lang)}</div>
                  </div>
                )
              }}
            />
            <Bar dataKey="amountNum" fill="var(--chart-income)" radius={[4, 4, 0, 0]} maxBarSize={48} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
