import React from 'react'
import Decimal from 'decimal.js'
import type { Lang, Money } from '~/lib/finance/types'
import { formatMoneyShort } from '~/lib/format/number'
import { useTranslation } from 'react-i18next'

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
}

const RADIUS = 60
const CIRCUMFERENCE = 2 * Math.PI * RADIUS // ~376.99
const GAP = 2

export function DonutBreakdown({
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
    .sort((a, b) => (b.decAmount.gt(a.decAmount) ? 1 : b.decAmount.lt(a.decAmount) ? -1 : 0))

  // Max 5 segments: 4 largest + "Lainnya"
  let displayItems: Array<{ id: string; name: string; amount: Money; decAmount: Decimal }> = []
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

  // Compute percentages that sum to 100% using Hare-Niemeyer / Largest Remainder
  const count = displayItems.length
  let percentages: number[] = []
  if (totalDec.isZero() || count === 0) {
    percentages = displayItems.map(() => 0)
  } else {
    const rawPcts = displayItems.map((it) => it.decAmount.div(totalDec).times(100).toNumber())
    const floorPcts = rawPcts.map((p) => Math.floor(p))
    const remainders = rawPcts.map((p, idx) => ({ idx, rem: p - floorPcts[idx]! }))
    remainders.sort((a, b) => b.rem - a.rem)

    let deficit = 100 - floorPcts.reduce((a, b) => a + b, 0)
    percentages = [...floorPcts]
    for (let i = 0; i < deficit && i < remainders.length; i++) {
      const idx = remainders[i]!.idx
      percentages[idx]! += 1
    }
  }

  // Calculate arc dash arrays & offsets
  // Total gap = count * GAP if count > 1
  const visibleSegments = displayItems.filter((it) => it.decAmount.gt(0))
  const totalGap = visibleSegments.length > 1 ? visibleSegments.length * GAP : 0
  const availableLength = CIRCUMFERENCE - totalGap

  let currentOffset = 0
  const segmentsData = displayItems.map((item, idx) => {
    if (totalDec.isZero() || item.decAmount.isZero()) {
      return {
        ...item,
        pct: percentages[idx] || 0,
        dashArray: `0 ${CIRCUMFERENCE.toFixed(1)}`,
        dashOffset: '0',
      }
    }

    const proportion = item.decAmount.div(totalDec).toNumber()
    const arcLength = Math.max(0, proportion * availableLength)
    const dashArray = `${arcLength.toFixed(1)} ${(CIRCUMFERENCE - arcLength).toFixed(1)}`
    const dashOffset = (-currentOffset).toFixed(1)
    currentOffset += arcLength + (visibleSegments.length > 1 ? GAP : 0)

    return {
      ...item,
      pct: percentages[idx] || 0,
      dashArray,
      dashOffset,
    }
  })

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
            r={RADIUS}
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
                r={RADIUS}
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
