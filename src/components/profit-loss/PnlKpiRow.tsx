import { useTranslation } from 'react-i18next'
import { KpiCard } from '~/components/neraca/KpiCard'
import { formatPercent } from '~/lib/format/number'
import type { Lang } from '~/lib/core/types'

type PnlLine = { key: string; amount: string; margin?: string | null }

/** Revenue, gross profit and net profit; the profits carry their margin as the caption. */
export function PnlKpiRow({
  lines,
  lang,
  compareLabel,
}: {
  lines: readonly PnlLine[]
  lang: Lang
  compareLabel: string
}) {
  const { t } = useTranslation()
  const byKey = new Map(lines.map((l) => [l.key, l]))
  const revenue = byKey.get('revenue')
  const grossProfit = byKey.get('grossProfit')
  const netProfit = byKey.get('netProfit')

  const marginLabel = (margin: string | null | undefined) =>
    margin ? `${t('metric.margin')}: ${formatPercent(margin, lang)}` : undefined

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <KpiCard
        label={t('ui.profitLoss.revenue')}
        value={revenue?.amount || '0'}
        compareLabel={compareLabel}
        higherIsBetter={true}
      />
      <KpiCard
        label={t('ui.profitLoss.grossProfit')}
        value={grossProfit?.amount || '0'}
        compareLabel={marginLabel(grossProfit?.margin)}
        higherIsBetter={true}
      />
      <KpiCard
        label={t('ui.profitLoss.netProfit')}
        value={netProfit?.amount || '0'}
        compareLabel={marginLabel(netProfit?.margin)}
        higherIsBetter={true}
      />
    </div>
  )
}
