import { useTranslation } from 'react-i18next'
import { formatPercent } from '~/lib/format/number'
import { runwayLabel } from '~/lib/finance/cash/runway-label'
import type { Lang } from '~/lib/core/types'

export type MiniMetrics = {
  runway: { cashFlowPositive: boolean; runwayMonths: string | null; currentRatio: string | null }
  grossMargin: string | null
  netMargin: string | null
}

/** Runway, gross margin, net margin and current ratio as four small figures. */
export function MiniMetricsBar({ metrics, lang }: { metrics: MiniMetrics; lang: Lang }) {
  const { t } = useTranslation()
  const { runway, grossMargin, netMargin } = metrics

  const items: Array<{ label: string; value: string }> = [
    { label: t('metric.runway'), value: runwayLabel(t, runway) },
    { label: t('metric.grossMargin'), value: grossMargin ? formatPercent(grossMargin, lang, 1) : '—' },
    { label: t('metric.netMargin'), value: netMargin ? formatPercent(netMargin, lang, 1) : '—' },
    { label: t('metric.currentRatio'), value: runway.currentRatio ? `${Number(runway.currentRatio).toFixed(2)}x` : '—' },
  ]

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
      {items.map((item) => (
        <div key={item.label} className="nr-card p-4">
          <span className="text-xs text-ink-muted block mb-1">{item.label}</span>
          <span className="text-lg font-bold">{item.value}</span>
        </div>
      ))}
    </div>
  )
}
