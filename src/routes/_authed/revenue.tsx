import { searchUpdater } from '~/lib/filters/search-update'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { revenueMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { DonutBreakdown } from '~/components/neraca/DonutBreakdown'
import { exportFilename } from '~/components/export/ExportCsvDialog'
import { MetricPageHeader } from '~/components/layout/MetricPageHeader'
import { useLang } from '~/components/layout/use-lang'
import { MonthlyTrendChart } from '~/components/revenue/MonthlyTrendChart'
import { RevenueEntityTable, RevenueFolderTable } from '~/components/revenue/RevenueTables'
import { RevenueKpiRow } from '~/components/revenue/RevenueKpiRow'
import { formatMonthYear, getCompareLabel } from '~/lib/format/date'

export const Route = createFileRoute('/_authed/revenue')({
  validateSearch: drillSearchSchema,
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    from: search.from,
    to: search.to,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(revenueMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: RevenuePage,
})

function RevenuePage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data } = useQuery(revenueMetricOptions(deps))
  const { t } = useTranslation()
  const lang = useLang()

  if (!data) return null

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)

  const handleSelectFolder = (folderId: string, folderLabel?: string) => {
    const folder = data.byFolder.find((f) => f.id === folderId)
    navigate({
      to: '/revenue',
      resetScroll: false,
      search: searchUpdater((prev) => ({
        ...prev,
        drill: {
          metric: 'revenue',
          steps: [{ kind: 'folder', id: folderId, label: folder?.label || folderLabel || folderId }],
        },
      })),
    })
  }

  return (
    <div className="space-y-6">
      <MetricPageHeader titleKey="nav.revenue" filter={deps} meta={data.meta} lang={lang} />

      <RevenueKpiRow
        total={data.total}
        compareTotal={data.compareTotal}
        compareLabel={compareLabel}
        byFolder={data.byFolder}
        byEntity={data.byEntity}
        onSelectFolder={handleSelectFolder}
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MonthlyTrendChart trend={data.trend} total={data.total} lang={lang} />

        <div className="lg:col-span-1">
          <DonutBreakdown
            title={t('ui.revenue.revenueComposition')}
            items={data.byFolder.map((f) => ({
              id: f.id,
              name: f.label,
              amount: f.amount,
            }))}
            totalLabel={t('ui.revenue.totalRevenue')}
            lang={lang}
            periodLabel={formatMonthYear(data.meta.asOf, lang)}
            onSelect={handleSelectFolder}
          />
        </div>
      </div>

      <RevenueFolderTable
        rows={data.byFolder}
        lang={lang}
        filename={exportFilename('revenue', deps)}
        onSelect={handleSelectFolder}
      />

      <RevenueEntityTable
        entities={data.byEntity}
        unassigned={data.entityUnassigned}
        lang={lang}
        filename={exportFilename('revenue-by-entity', deps)}
      />
    </div>
  )
}
