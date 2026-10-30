import { Cell } from 'recharts'
import { useTranslation } from 'react-i18next'
import type { Lang, Money } from '~/lib/core/types'
import {
  monthRangeLabel,
  peakMonthOf,
  type CashflowChartRow,
  type CashflowMonthData,
} from '~/lib/finance/cash/cashflow-chart'
import { formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatMonth, formatMonthYear } from '~/lib/format/date'

/** The range of months, the net cash flow as a big number, and the legend. */
export function CashflowSummary({ rangeLabel, net, lang }: { rangeLabel: string; net: Money; lang: Lang }) {
  const { t } = useTranslation()
  return (
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
          <span style={{ fontSize: '16px', color: 'var(--ink-muted)', marginRight: '6px' }}>Rp</span>
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
  )
}

/** The hover card of one month, with the exact amounts. */
export function CashflowTooltip({
  active,
  payload,
  lang,
}: {
  active?: boolean
  payload?: ReadonlyArray<{ payload?: CashflowChartRow }>
  lang: Lang
}) {
  const { t } = useTranslation()
  if (!active || !payload || !payload.length) return null
  const item = payload[0]?.payload
  if (!item) return null
  return (
    <div className="nr-tooltip" role="tooltip">
      <span className="nr-tooltip-title">{formatMonthYear(item.monthKey, lang)}</span>
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
}

/** The cells of one bar series: the colour, an outline on the selected month and a pointer when clickable. */
export function monthCells(
  prefix: 'in' | 'out',
  fill: string,
  rows: readonly CashflowChartRow[],
  selectedMonth: string | undefined,
  clickable: boolean,
) {
  return rows.map((entry) => {
    const selected = entry.monthKey === selectedMonth
    return (
      <Cell
        key={`${prefix}-${entry.monthKey}`}
        fill={fill}
        stroke={selected ? 'var(--lime-strong)' : 'none'}
        strokeWidth={selected ? 2 : 0}
        style={{ cursor: clickable ? 'pointer' : 'default' }}
      />
    )
  })
}

/** The label of the period shown ("Jan – Mar") and the description a screen reader gets for the chart. */
export function useCashflowChartLabels(data: readonly CashflowMonthData[], rows: readonly CashflowChartRow[], lang: Lang) {
  const { t } = useTranslation()
  const peakMonth = peakMonthOf(rows)
  const rangeLabel = monthRangeLabel(data, lang)
  const ariaLabel = t('ui.cashflowChart.ariaLabel', {
    range: rangeLabel,
    peak: peakMonth ? formatMonth(peakMonth, lang) : '-',
  })
  return { rangeLabel, ariaLabel }
}
