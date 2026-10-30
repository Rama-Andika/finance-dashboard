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
import { Tabs } from '~/components/neraca/Tabs'
import { MetricPageHeader } from '~/components/layout/MetricPageHeader'
import { useLang } from '~/components/layout/use-lang'
import { PnlStatementTable } from '~/components/profit-loss/PnlStatementTable'
import { FixedCostPanel } from '~/components/profit-loss/FixedCostPanel'
import { PnlKpiRow } from '~/components/profit-loss/PnlKpiRow'
import { getCompareLabel } from '~/lib/format/date'

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
  const { t } = useTranslation()
  const lang = useLang()

  const [activeTab, setActiveTab] = useState<'pnl' | 'fixedCost'>('pnl')

  if (!pnlData) return null

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)

  return (
    <div className="space-y-6">
      <MetricPageHeader titleKey="nav.profitLoss" filter={deps} meta={pnlData.meta} lang={lang} />

      <PnlKpiRow lines={pnlData.lines} lang={lang} compareLabel={compareLabel} />

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
