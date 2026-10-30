import { useTranslation } from 'react-i18next'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts'
import { formatAxisShort, formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import type { Lang, Money } from '~/lib/core/types'
import type { buildWaterfall } from '~/lib/finance/cash/cashflow-view'

const CHART_HEIGHT = 260

/** Opening cash, the three activity totals and closing cash as one bar each. */
export function CashFlowWaterfall({
  data,
  netCashFlow,
  lang,
}: {
  data: ReturnType<typeof buildWaterfall>
  netCashFlow: Money
  lang: Lang
}) {
  const { t } = useTranslation()
  return (
    <div className="nr-card space-y-4">
      <div className="nr-card-head" style={{ margin: 0 }}>
        <h3 className="nr-card-title">{t('ui.cashFlow.cashFlowWaterfall')}</h3>
        <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
          {formatMoneyShort(netCashFlow, lang)}
        </span>
      </div>

      <div style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
            <XAxis
              dataKey="name"
              axisLine={{ stroke: 'var(--chart-axis)' }}
              tickLine={false}
              tick={{ fill: 'var(--ink-muted)', fontSize: 12 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
              tickFormatter={(val) => formatAxisShort(val, lang)}
            />
            <RechartsTooltip
              cursor={{ fill: 'var(--surface-hover)' }}
              content={({ active, payload }) => {
                if (!active || !payload || payload.length === 0) return null
                const item = payload[0]?.payload
                return (
                  <div className="nr-tooltip">
                    <div className="font-semibold">{item.name}</div>
                    <div className="tabular-nums font-semibold mt-1">{formatMoneyFull(item.rawAmount, lang)}</div>
                  </div>
                )
              }}
            />
            <Bar dataKey="amountNum" radius={[4, 4, 0, 0]} maxBarSize={48}>
              {data.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
