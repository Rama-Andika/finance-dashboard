import { useTranslation } from 'react-i18next'
import type { Lang, Money } from '~/lib/core/types'
import { D } from '~/lib/core/money'
import {
  DONUT_CIRCUMFERENCE,
  DONUT_GAP,
  buildDonutArcs,
} from '~/lib/core/donut'
import { buildEntityShare, type EntityShareSegment } from '~/lib/finance/pnl/revenue-entity'
import { formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { FigureTooltip } from '~/components/neraca/FigureTooltip'
import { DonutRing, type RingSegment } from '~/components/neraca/DonutBreakdownParts'

export interface EntityDonutProps {
  title?: string | undefined
  items: Array<{ id: string; name: string; amount: Money }>
  /** Revenue that belongs to no entity; joins the "Other" segment when positive. */
  unassigned: Money
  totalLabel: string
  lang: Lang
  periodLabel?: string | undefined
  detailsLabel?: string | undefined
  onDetails?: (() => void) | undefined
  onSelect?: ((id: string) => void) | undefined
}

const segmentClass = (seg: EntityShareSegment, index: number) => (seg.isOther ? 'so' : `s${index + 1}`)
const dotClass = (seg: EntityShareSegment, index: number) => (seg.isOther ? 'nr-dot-other' : `nr-dot-${index + 1}`)
/** A segment with an amount but under 0.5% rounds to 0; show it as "<1%" instead of "0%". */
const pctLabel = (pct: number) => (pct === 0 ? '<1%' : `${pct}%`)

/**
 * "Revenue by Entity" donut: up to 10 entities plus "Other" in the ring, the 5 largest in the legend
 * (percent only), a "+N more" row for the rest, and full amounts in tooltips.
 * Used through `<DonutBreakdown variant="entity" />`.
 */
export function EntityDonut({
  title,
  items,
  unassigned,
  totalLabel,
  lang,
  periodLabel,
  detailsLabel,
  onDetails,
  onSelect,
}: EntityDonutProps) {
  const { t } = useTranslation()
  const share = buildEntityShare(items, unassigned, t('ui.donutBreakdown.other'))
  const arcs = buildDonutArcs(
    share.segments.map((s) => D(s.amount)),
    DONUT_CIRCUMFERENCE,
    DONUT_GAP,
  )

  const heading = title ?? t('ui.donutBreakdown.composition')
  const tooltipOf = (seg: EntityShareSegment) => `${seg.name}: IDR ${formatMoneyFull(seg.amount, lang)}`
  const ringSegments: RingSegment[] = share.segments.map((seg, idx) => ({
    id: seg.id,
    dashArray: arcs[idx]?.dashArray ?? '0 0',
    dashOffset: arcs[idx]?.dashOffset ?? '0',
    className: segmentClass(seg, idx),
    tooltip: tooltipOf(seg),
  }))
  const top = share.segments[0]
  const ariaLabel = t('ui.donutBreakdown.ariaLabel', {
    title: heading,
    period: periodLabel ?? '',
    total: formatMoneyShort(share.total, lang),
    top: top ? top.name : '—',
    pct: top ? top.pct : 0,
  })
  const cursor = onSelect ? 'pointer' : 'default'

  return (
    <section className="nr-card nr-donut">
      <div className="nr-card-head" style={{ margin: 0 }}>
        <h3 className="nr-card-title">{heading}</h3>
        {onDetails && (
          <button type="button" className="nr-card-link" onClick={onDetails}>
            {detailsLabel ?? t('ui.summary.details')}
            <span aria-hidden="true"> ›</span>
          </button>
        )}
      </div>

      {share.segments.length === 0 ? (
        <p className="nr-muted">{t('common.noData')}</p>
      ) : (
        <>
          <DonutRing
            segments={ringSegments}
            totalLabel={totalLabel}
            totalFormatted={formatMoneyShort(share.total, lang)}
            totalTooltip={`IDR ${formatMoneyFull(share.total, lang)}`}
            ariaLabel={ariaLabel}
            onSelect={onSelect}
          />

          <ul className="nr-donut-list">
            {share.legend.map((seg, idx) => (
              <FigureTooltip key={seg.id} full={tooltipOf(seg)}>
                <li style={{ cursor }} onClick={() => onSelect?.(seg.id)}>
                  <i className={`nr-dot ${dotClass(seg, idx)}`} aria-hidden="true" />
                  <span className="nr-donut-name">{seg.name}</span>
                  <b>{pctLabel(seg.pct)}</b>
                </li>
              </FigureTooltip>
            ))}
            {share.rest && (
              <li className="nr-donut-rest">
                <i className="nr-dot nr-dot-other" aria-hidden="true" />
                <span className="nr-donut-name">{t('ui.donutBreakdown.moreItems', { count: share.rest.count })}</span>
                <b>{pctLabel(share.rest.pct)}</b>
              </li>
            )}
          </ul>

          {share.hiddenCount > 0 && (
            <p className="nr-muted nr-donut-note">{t('ui.donutBreakdown.hiddenEntities', { count: share.hiddenCount })}</p>
          )}
        </>
      )}
    </section>
  )
}
