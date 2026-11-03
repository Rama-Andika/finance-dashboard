import type { Lang, Money } from '~/lib/core/types'
import { formatMoneyShort } from '~/lib/format/number'
import { useTranslation } from 'react-i18next'
import { buildDonutDisplayItems, buildDonutSegments, splitDrawableItems } from '~/lib/format/donut'
import { EntityDonut } from '~/components/charts/EntityDonut'
import { DonutLegend, DonutRing, DonutTabs } from '~/components/charts/DonutBreakdownParts'

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
  const displayTitle = title ?? t('ui.donutBreakdown.composition')

  // Only slices above zero are drawn. The number in the middle is the net total of every slice, so a negative
  // slice lowers it and it keeps agreeing with the P&L.
  const drawable = splitDrawableItems(items)
  // Max 5 segments: the 4 largest + "Other"
  const displayItems = buildDonutDisplayItems(drawable.items, t('ui.donutBreakdown.other'))
  const segments = buildDonutSegments(displayItems)
  const totalFormatted = formatMoneyShort(drawable.total.toFixed(0), lang)

  // Accessible description
  const ariaLabel = t('ui.donutBreakdown.ariaLabel', {
    title: displayTitle,
    period: periodLabel ?? '',
    total: totalFormatted,
    top: displayItems[0] ? displayItems[0].name : '—',
    pct: segments[0]?.pct ?? 0,
  })

  return (
    <section className="nr-card nr-donut">
      <div className="nr-card-head" style={{ margin: 0 }}>
        <h3 className="nr-card-title">{displayTitle}</h3>
        {periodLabel && (
          <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
            {periodLabel}
          </span>
        )}
      </div>

      {tabs && tabs.length > 0 && <DonutTabs tabs={tabs} activeTab={activeTab} onTabChange={onTabChange} />}

      <DonutRing
        segments={segments}
        totalLabel={totalLabel}
        totalFormatted={totalFormatted}
        ariaLabel={ariaLabel}
        onSelect={onSelect}
      />
      <DonutLegend segments={segments} lang={lang} onSelect={onSelect} />

      {drawable.negativeCount > 0 && (
        <p className="nr-muted nr-donut-note">
          {t('ui.donutBreakdown.hiddenNegative', { count: drawable.negativeCount })}
        </p>
      )}
    </section>
  )
}
