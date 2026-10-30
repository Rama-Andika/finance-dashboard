import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import {
  pnlMetricOptions,
  fixedCostMetricOptions,
  runwayMetricOptions,
} from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { Tabs } from '~/components/neraca/Tabs'
import { PrintHeader } from '~/components/export/PrintHeader'
import { PnlStatementTable } from '~/components/profit-loss/PnlStatementTable'
import { FixedCostPanel } from '~/components/profit-loss/FixedCostPanel'
import { formatPercent } from '~/lib/format/number'
import { formatMonthYear, getCompareLabel } from '~/lib/format/date'
import type { Lang } from '~/lib/core/types'

export const Route = createFileRoute('/_authed/profit-loss')({
  validateSearch: drillSearchSchema,
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    from: search.from,
    to: search.to,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(pnlMetricOptions(deps)),
      context.queryClient.ensureQueryData(fixedCostMetricOptions(deps)),
      context.queryClient.ensureQueryData(runwayMetricOptions(deps)),
    ]),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: ProfitLossPage,
})

function ProfitLossPage() {
  const deps = Route.useLoaderDeps()
  const { data: pnlData } = useQuery(pnlMetricOptions(deps))
  const { data: fixedData } = useQuery(fixedCostMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  const [activeTab, setActiveTab] = useState<'pnl' | 'fixedCost'>('pnl')

  if (!pnlData) return null

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)

  const lineMap = new Map(pnlData.lines.map((l) => [l.key, l]))
  const revLine = lineMap.get('revenue')
  const gpLine = lineMap.get('grossProfit')
  const npLine = lineMap.get('netProfit')

  const marginLabel = (margin: string | null | undefined) =>
    margin ? `${t('metric.margin')}: ${formatPercent(margin, lang)}` : undefined

  return (
    <div className="space-y-6">
      <PrintHeader
        title={t('nav.profitLoss')}
        entity={deps.entity}
        preset={deps.from && deps.to ? `${deps.from} – ${deps.to}` : deps.preset}
        asOf={pnlData.meta.asOf}
      />
      {pnlData.meta.hasOpenPeriod && (
        <Notice
          tone="warning"
          title={t('metric.openPeriodWarning', {
            month: formatMonthYear(pnlData.meta.asOf, lang),
          })}
        />
      )}
      {pnlData.meta.missingMonths.length > 0 && (
        <Notice
          tone="warning"
          title={t('metric.missingMonthsWarning')}
          body={pnlData.meta.missingMonths.join(', ')}
        />
      )}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={t('ui.profitLoss.revenue')}
          value={revLine?.amount || '0'}
          compareLabel={compareLabel}
          higherIsBetter={true}
        />
        <KpiCard
          label={t('ui.profitLoss.grossProfit')}
          value={gpLine?.amount || '0'}
          compareLabel={marginLabel(gpLine?.margin)}
          higherIsBetter={true}
        />
        <KpiCard
          label={t('ui.profitLoss.netProfit')}
          value={npLine?.amount || '0'}
          compareLabel={marginLabel(npLine?.margin)}
          higherIsBetter={true}
        />
      </div>

      <div className="w-72">
        <Tabs
          tabs={[
            { id: 'pnl', label: t('ui.profitLoss.pLStatement') },
            { id: 'fixedCost', label: t('metric.tabs.fixedCost') },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === 'pnl' && <PnlStatementTable lines={pnlData.lines} lang={lang} scope={deps} />}
      {activeTab === 'fixedCost' && fixedData && <FixedCostPanel data={fixedData} lang={lang} scope={deps} />}
    </div>
  )
}
