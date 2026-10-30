import type { Lang } from '~/lib/core/types'
import { DONUT_RADIUS, type DonutSegment } from '~/lib/core/donut'
import { formatMoneyShort } from '~/lib/format/number'

export type DonutTab = { id: 'revenue' | 'expense' | string; label: string }

/** The tab buttons above the ring (for example Revenue / Expense). */
export function DonutTabs({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: DonutTab[]
  activeTab?: string
  onTabChange?: (tab: string) => void
}) {
  return (
    <div className="nr-tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          className="nr-tab"
          role="tab"
          type="button"
          aria-selected={activeTab === tab.id}
          onClick={() => onTabChange?.(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** The ring: one arc per segment and the total in the middle. */
export function DonutRing({
  segments,
  totalLabel,
  totalFormatted,
  ariaLabel,
  onSelect,
}: {
  segments: DonutSegment[]
  totalLabel: string
  totalFormatted: string
  ariaLabel: string
  onSelect?: (id: string) => void
}) {
  return (
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
        <circle cx="80" cy="80" r={DONUT_RADIUS} fill="none" stroke="var(--surface-sunken)" strokeWidth="18" />
        {segments.map((seg, idx) => (
          <circle
            key={seg.id}
            className={`s${(idx % 5) + 1}`}
            cx="80"
            cy="80"
            r={DONUT_RADIUS}
            strokeDasharray={seg.dashArray}
            strokeDashoffset={seg.dashOffset}
            style={{ cursor: onSelect ? 'pointer' : 'default' }}
            onClick={() => onSelect?.(seg.id)}
          />
        ))}
      </g>
      <text className="nr-donut-caption" x="80" y="72" textAnchor="middle">
        {totalLabel}
      </text>
      <text className="nr-donut-center" x="80" y="94" textAnchor="middle">
        {totalFormatted}
      </text>
    </svg>
  )
}

/** The list under the ring: percentage chip, name and short amount per segment. */
export function DonutLegend({
  segments,
  lang,
  onSelect,
}: {
  segments: DonutSegment[]
  lang: Lang
  onSelect?: (id: string) => void
}) {
  return (
    <ul className="nr-donut-list">
      {segments.map((seg, idx) => (
        <li key={seg.id} style={{ cursor: onSelect ? 'pointer' : 'default' }} onClick={() => onSelect?.(seg.id)}>
          <span className={`nr-chip nr-chip-${(idx % 5) + 1}`}>{seg.pct}%</span>
          <span>{seg.name}</span>
          <b>{formatMoneyShort(seg.amount, lang)}</b>
        </li>
      ))}
    </ul>
  )
}
