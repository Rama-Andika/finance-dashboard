import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { budgetMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { BudgetTable } from '~/components/budget/BudgetTable'
import { exportFilename } from '~/components/export/ExportCsvDialog'
import { PrintHeader } from '~/components/export/PrintHeader'
import { useOpenDrill } from '~/components/drill/useOpenDrill'
import { formatMonthYear } from '~/lib/format/date'
import type { Lang } from '~/lib/core/types'

export const Route = createFileRoute('/_authed/budget')({
  validateSearch: drillSearchSchema,
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    from: search.from,
    to: search.to,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(budgetMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: BudgetPage,
})

function BudgetPage() {
  const deps = Route.useLoaderDeps()
  const { data } = useQuery(budgetMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang
  const openDrill = useOpenDrill()

  if (!data) return null

  return (
    <div className="space-y-6">
      <PrintHeader
        title={t('nav.budget')}
        entity={deps.entity}
        preset={deps.from && deps.to ? `${deps.from} – ${deps.to}` : deps.preset}
        asOf={data.meta.asOf}
      />
      {data.meta.hasOpenPeriod && (
        <Notice
          tone="warning"
          title={t('metric.openPeriodWarning', {
            month: formatMonthYear(data.meta.asOf, lang),
          })}
        />
      )}
      {data.meta.missingMonths.length > 0 && (
        <Notice
          tone="warning"
          title={t('metric.missingMonthsWarning')}
          body={data.meta.missingMonths.join(', ')}
        />
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={t('ui.budget.totalBudget')}
          value={data.summary.budget}
          higherIsBetter={true}
        />
        <KpiCard
          label={t('ui.budget.totalActual')}
          value={data.summary.actual}
          higherIsBetter={true}
        />
        <KpiCard
          label={t('ui.budget.netVariance')}
          value={data.summary.variance}
          compareLabel={
            data.summary.variancePercent
              ? t('ui.budget.varianceShare', { pct: data.summary.variancePercent })
              : undefined
          }
          higherIsBetter={true}
        />
      </div>

      <BudgetTable
        rows={data.rows}
        lang={lang}
        filename={exportFilename('budget_vs_actual', deps)}
        onOpen={(coaId, name) => openDrill('budget', [{ kind: 'account', id: coaId, label: name }])}
      />
    </div>
  )
}
