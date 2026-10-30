import Decimal from 'decimal.js'
import type { Lang, Money } from '~/lib/core/types'
import { formatMoneyShort } from '~/lib/format/number'
import { useTranslation } from 'react-i18next'
import {
  DONUT_CIRCUMFERENCE,
  DONUT_GAP,
  DONUT_RADIUS,
  buildDonutArcs,
  largestRemainderPercentages,
} from '~/lib/core/donut'
import { EntityDonut } from '~/components/neraca/EntityDonut'

export interface DonutBreakdownItem {
  id: string
  name: string
  amount: Money
}

export interface DonutBreakdownProps {
  title?: string
  tabs?: Array<{ id: 'revenue' | 'expense' | string; label: string }>
  activeTab?: string
  onTabChange?: (tab: string) => void
  items: DonutBreakdownItem[]
  totalLabel: string
  lang: Lang
  onSelect?: (id: string) => void
  periodLabel?: string
  /** 'entity': up to 10 ring segments, a legend of the 5 largest (percent only) and a "Details" link. */
  variant?: 'default' | 'entity'
  /** Entity variant: revenue that belongs to no entity; joins the "Other" segment when positive. */
  unassigned?: Money
  /** Entity variant: text and handler of the "Details ›" link in the card header. */
  detailsLabel?: string
  onDetails?: () => void
}

export function DonutBreakdown(props: DonutBreakdownProps) {
  if (props.variant === 'entity') {
    return (
      <EntityDonut
        title={props.title}
        items={props.items}
        unassigned={props.unassigned ?? '0.00'}
        totalLabel={props.totalLabel}
        lang={props.lang}
        periodLabel={props.periodLabel}
        detailsLabel={props.detailsLabel}
        onDetails={props.onDetails}
        onSelect={props.onSelect}
      />
    )
  }
  return <DefaultDonut {...props} />
}

function DefaultDonut({
  title,
  tabs,
  activeTab,
  onTabChange,
  items,
  totalLabel,
  lang,
  onSelect,
  periodLabel,
}: DonutBreakdownProps) {
  const { t } = useTranslation()
  // Sort items descending by absolute amount
  const sorted = [...items]
    .map((item) => ({ ...item, decAmount: new Decimal(item.amount || '0').abs() }))
    .sort((a, b) => b.decAmount.cmp(a.decAmount))

  // Max 5 segments: 4 largest + "Lainnya"
  let displayItems: Array<{ id: string; name: string; amount: Money; decAmount: Decimal }>
  if (sorted.length <= 5) {
    displayItems = sorted
  } else {
    const top4 = sorted.slice(0, 4)
    const rest = sorted.slice(4)
    const otherSum = rest.reduce((sum, item) => sum.add(item.decAmount), new Decimal(0))
    displayItems = [
      ...top4,
      {
        id: 'other',
        name: t('ui.donutBreakdown.other'),
        amount: otherSum.toFixed(0),
        decAmount: otherSum,
      },
    ]
  }

  // Calculate total
  const totalDec = displayItems.reduce((sum, it) => sum.add(it.decAmount), new Decimal(0))
  const totalFormatted = formatMoneyShort(totalDec.toFixed(0), lang)

  // Percentages that add up to 100 (largest remainder) and the stroke settings of each arc
  const amounts = displayItems.map((it) => it.decAmount)
  const percentages = largestRemainderPercentages(amounts)
  const arcs = buildDonutArcs(amounts, DONUT_CIRCUMFERENCE, DONUT_GAP)
  const segmentsData = displayItems.map((item, idx) => ({
    ...item,
    pct: percentages[idx] ?? 0,
    dashArray: arcs[idx]?.dashArray ?? '0 0',
    dashOffset: arcs[idx]?.dashOffset ?? '0',
  }))

  // Accessible description
  const topSegment = displayItems[0]
  const topPct = percentages[0] ?? 0
  const ariaLabel =
    t('ui.donutBreakdown.ariaLabel', {
      title: title ?? t('ui.donutBreakdown.composition'),
      period: periodLabel ?? '',
      total: totalFormatted,
      top: topSegment ? topSegment.name : '—',
      pct: topPct,
    })

  return (
    <section className="nr-card nr-donut">
      <div className="nr-card-head" style={{ margin: 0 }}>
        <h3 className="nr-card-title">{title ?? (t('ui.donutBreakdown.composition'))}</h3>
        {periodLabel && (
          <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
            {periodLabel}
          </span>
        )}
      </div>

      {tabs && tabs.length > 0 && (
        <div className="nr-tabs" role="tablist">
          {tabs.map((tab) => {
            const isSelected = activeTab === tab.id
            return (
              <button
                key={tab.id}
                className="nr-tab"
                role="tab"
                type="button"
                aria-selected={isSelected}
                onClick={() => onTabChange?.(tab.id)}
              >
                {tab.label}
              </button>
            )
          })}
        </div>
      )}

      <svg
        className="nr-donut-ring"
        viewBox="0 0 160 160"
        width="168"
        height="168"
        style={{ alignSelf: 'center' }}
        role="img"
        aria-label={ariaLabel}
      >
        <g transform="rotate(-90 80 80)">
          <circle
            cx="80"
            cy="80"
            r={DONUT_RADIUS}
            fill="none"
            stroke="var(--surface-sunken)"
            strokeWidth="18"
          />
          {segmentsData.map((seg, idx) => {
            const classNum = (idx % 5) + 1
            return (
              <circle
                key={seg.id}
                className={`s${classNum}`}
                cx="80"
                cy="80"
                r={DONUT_RADIUS}
                strokeDasharray={seg.dashArray}
                strokeDashoffset={seg.dashOffset}
                style={{ cursor: onSelect ? 'pointer' : 'default' }}
                onClick={() => onSelect?.(seg.id)}
              />
            )
          })}
        </g>
        <text className="nr-donut-caption" x="80" y="72" textAnchor="middle">
          {totalLabel}
        </text>
        <text className="nr-donut-center" x="80" y="94" textAnchor="middle">
          {totalFormatted}
        </text>
      </svg>

      <ul className="nr-donut-list">
        {segmentsData.map((seg, idx) => {
          const classNum = (idx % 5) + 1
          return (
            <li
              key={seg.id}
              style={{ cursor: onSelect ? 'pointer' : 'default' }}
              onClick={() => onSelect?.(seg.id)}
            >
              <span className={`nr-chip nr-chip-${classNum}`}>{seg.pct}%</span>
              <span>{seg.name}</span>
              <b>{formatMoneyShort(seg.amount, lang)}</b>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
