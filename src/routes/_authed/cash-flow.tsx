import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import {
  cashFlowMetricOptions,
  expensePaidMetricOptions,
} from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { KpiCard } from '~/components/neraca/KpiCard'
import { CashflowChart } from '~/components/neraca/CashflowChart'
import { Tabs } from '~/components/neraca/Tabs'
import { MetricPageHeader } from '~/components/layout/MetricPageHeader'
import { useLang } from '~/components/layout/use-lang'
import { CashFlowWaterfall } from '~/components/cash-flow/CashFlowWaterfall'
import { ActivitiesTable } from '~/components/cash-flow/ActivitiesTable'
import { ExpensePaidPanel } from '~/components/cash-flow/ExpensePaidPanel'
import { buildActivityRows, buildWaterfall, localizeExpense } from '~/lib/finance/cash/cashflow-view'

export const Route = createFileRoute('/_authed/cash-flow')({
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
      context.queryClient.ensureQueryData(cashFlowMetricOptions(deps)),
      context.queryClient.ensureQueryData(expensePaidMetricOptions(deps)),
    ]),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: CashFlowPage,
})

function CashFlowPage() {
  const deps = Route.useLoaderDeps()
  const { data: cfData } = useQuery(cashFlowMetricOptions(deps))
  const { data: expDataRaw } = useQuery(expensePaidMetricOptions(deps))
  const { t } = useTranslation()
  const lang = useLang()

  const [activeTab, setActiveTab] = useState<'activities' | 'expensePaid'>('activities')

  if (!cfData) return null

  const expData = expDataRaw ? { ...expDataRaw, byCategory: expDataRaw.byCategory.map((b) => localizeExpense(b, t)) } : undefined

  return (
    <div className="space-y-6">
      <MetricPageHeader titleKey="nav.cashFlow" filter={deps} meta={cfData.meta} lang={lang} />

      <div className="text-xs text-ink-muted flex items-center gap-1.5">
        <Info className="nr-icon nr-icon-sm" />
        <span>
          {t('ui.cashFlow.classificationSource')}{' '}
          <strong className="text-ink">
            {cfData.source === 'setup'
              ? t('ui.cashFlow.cashFlowSetupTable')
              : t('ui.cashFlow.offsetAccountFallback')}
          </strong>
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label={t('metric.openingCash')} value={cfData.openingCash} higherIsBetter={true} />
        <KpiCard label={t('metric.netCashFlow')} value={cfData.netCashFlow} higherIsBetter={true} />
        <KpiCard label={t('metric.closingCash')} value={cfData.closingCash} higherIsBetter={true} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CashFlowWaterfall data={buildWaterfall(cfData, t)} netCashFlow={cfData.netCashFlow} lang={lang} />
        <CashflowChart
          title={t('ui.cashFlow.monthlyCashFlow')}
          data={cfData.monthly}
          net={cfData.netCashFlow}
          lang={lang}
        />
      </div>

      <div className="w-72">
        <Tabs
          tabs={[
            { id: 'activities', label: t('ui.cashFlow.activities') },
            { id: 'expensePaid', label: t('metric.tabs.expensePaid') },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {activeTab === 'activities' && (
        <ActivitiesTable rows={buildActivityRows(cfData.drawers, t)} lang={lang} scope={deps} />
      )}
      {activeTab === 'expensePaid' && expData && <ExpensePaidPanel data={expData} lang={lang} scope={deps} />}
    </div>
  )
}
