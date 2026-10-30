import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts'
import { formatAxisShort, formatMoneyFull } from '~/lib/format/number'
import { formatDate } from '~/lib/format/date'
import type { Lang } from '~/lib/core/types'
import type { PaymentPlanDay } from '~/lib/finance/ap-ar/payment-plan'

const CHART_HEIGHT = 260

/** Closing cash balance per day, with a zero line to show where the balance turns negative. */
export function ProjectedBalanceChart({ days, horizon, lang }: { days: PaymentPlanDay[]; horizon: string; lang: Lang }) {
  const { t } = useTranslation()
  const chartData = days.map((d) => ({
    date: d.date,
    displayDate: formatDate(d.date, lang),
    closingNum: Number(d.closing) || 0,
    rawClosing: d.closing,
    isNegative: d.isNegative,
  }))

  return (
    <div className="nr-card space-y-4">
      <div className="nr-card-head" style={{ margin: 0 }}>
        <h3 className="nr-card-title">{t('ui.paymentPlan.dailyProjectedCashBalance')}</h3>
        <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
          {horizon} {t('ui.paymentPlan.daysProjection')}
        </span>
      </div>

      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="displayDate"
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickLine={false}
              tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
              tickFormatter={(val) => formatAxisShort(val, lang)}
            />
            <RechartsTooltip
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null
                const item = payload[0]?.payload
                return (
                  <div className="nr-tooltip">
                    <div className="font-semibold">{item.displayDate}</div>
                    <div className={`tabular-nums font-semibold mt-1 ${item.isNegative ? 'text-danger' : ''}`}>
                      {formatMoneyFull(item.rawClosing, lang)}
                    </div>
                    {item.isNegative && <div className="text-xs text-danger mt-0.5">{t('ui.col.negativeClosing')}</div>}
                  </div>
                )
              }}
            />
            <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="3 3" />
            <Line
              type="monotone"
              dataKey="closingNum"
              stroke="var(--chart-forest)"
              strokeWidth={2.5}
              dot={{ r: 4, fill: 'var(--chart-forest)' }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
