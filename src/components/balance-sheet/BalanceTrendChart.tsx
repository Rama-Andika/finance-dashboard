import { useTranslation } from 'react-i18next'
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { categoryAxisProps, valueAxisProps } from '~/components/charts/chart-axis'
import { toChartNumber } from '~/lib/core/money'
import { formatMonth, formatMonthYear } from '~/lib/format/date'
import { formatAxisShort, formatMoneyFull } from '~/lib/format/number'
import type { BalanceTrendPoint } from '~/lib/finance/balance-sheet/trend'
import type { Lang } from '~/lib/core/types'

const CHART_HEIGHT = 280
/** Months that are not closed yet are drawn with the same colors, lighter. */
const PROVISIONAL_OPACITY = 0.45

/**
 * One column per month: liabilities and equity stacked (together they are as tall as the assets) and the assets as a
 * dashed line, so a month where the two sides differ shows as a gap between the column and the line.
 */
export function BalanceTrendChart({ points, lang }: { points: BalanceTrendPoint[]; lang: Lang }) {
  const { t } = useTranslation()
  // Display only: recharts needs JS numbers for heights; the exact amounts stay in `point`.
  const data = points.map((point) => ({
    displayMonth: formatMonth(`${point.monthKey}-01`, lang),
    assets: toChartNumber(point.assets),
    liabilities: point.provisional ? 0 : toChartNumber(point.liabilities),
    equity: point.provisional ? 0 : toChartNumber(point.equity),
    liabilitiesOpen: point.provisional ? toChartNumber(point.liabilities) : 0,
    equityOpen: point.provisional ? toChartNumber(point.equity) : 0,
    point,
  }))

  return (
    <div style={{ height: CHART_HEIGHT }}>
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 10 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="displayMonth" {...categoryAxisProps} />
          <YAxis {...valueAxisProps} tickFormatter={(value) => formatAxisShort(value, lang)} />
          <RechartsTooltip
            cursor={{ fill: 'var(--surface-hover)' }}
            content={({ active, payload }) => {
              if (!active || !payload || payload.length === 0) return null
              const point = payload[0]?.payload?.point as BalanceTrendPoint | undefined
              if (!point) return null
              return (
                <div className="nr-tooltip">
                  <div className="font-semibold">{formatMonthYear(`${point.monthKey}-01`, lang)}</div>
                  <div className="tabular-nums mt-1">
                    {t('balanceSheet.trend.assets')}: {formatMoneyFull(point.assets, lang)}
                  </div>
                  <div className="tabular-nums">
                    {t('balanceSheet.trend.liabilities')}: {formatMoneyFull(point.liabilities, lang)}
                  </div>
                  <div className="tabular-nums">
                    {t('balanceSheet.trend.equity')}: {formatMoneyFull(point.equity, lang)}
                  </div>
                  {point.provisional && (
                    <div className="text-xs text-ink-muted mt-1">{t('balanceSheet.trend.provisionalNote')}</div>
                  )}
                </div>
              )
            }}
          />
          <Legend />
          <Bar
            dataKey="liabilities"
            stackId="side"
            name={t('balanceSheet.trend.liabilities')}
            fill="var(--chart-3)"
            maxBarSize={48}
          />
          <Bar
            dataKey="equity"
            stackId="side"
            name={t('balanceSheet.trend.equity')}
            fill="var(--chart-1)"
            maxBarSize={48}
          />
          <Bar
            dataKey="liabilitiesOpen"
            stackId="side"
            fill="var(--chart-3)"
            fillOpacity={PROVISIONAL_OPACITY}
            legendType="none"
            maxBarSize={48}
          />
          <Bar
            dataKey="equityOpen"
            stackId="side"
            fill="var(--chart-1)"
            fillOpacity={PROVISIONAL_OPACITY}
            legendType="none"
            maxBarSize={48}
          />
          <Line
            dataKey="assets"
            name={t('balanceSheet.trend.assets')}
            stroke="var(--ink-muted)"
            strokeDasharray="4 3"
            dot={{ r: 3 }}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )
}
