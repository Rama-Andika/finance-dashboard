import { searchUpdater } from '~/lib/filters/search-update'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { revenueMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { DonutBreakdown } from '~/components/neraca/DonutBreakdown'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { ExportCsvButton, exportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { PrintHeader } from '~/components/export/PrintHeader'
import { MonthlyTrendChart } from '~/components/revenue/MonthlyTrendChart'
import { formatMoneyFull } from '~/lib/format/number'
import { formatMonthYear, getCompareLabel } from '~/lib/format/date'
import { largestByAmount } from '~/lib/core/money'
import type { Breakdown, Lang } from '~/lib/core/types'

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
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  if (!data) return null

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)
  const topCategory = largestByAmount(data.byFolder)
  const topEntity = largestByAmount(data.byEntity)

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

  const columns: ColumnDef<Breakdown, unknown>[] = [
    {
      accessorKey: 'label',
      header: t('ui.revenue.categoryFolder'),
      cell: ({ row }) => <span className="nr-name">{row.original.label}</span>,
    },
    {
      accessorKey: 'amount',
      header: t('ui.revenue.totalIdr'),
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
  ]

  return (
    <div className="space-y-6">
      <PrintHeader
        title={t('nav.revenue')}
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={t('nav.revenue')}
          value={data.total}
          compareValue={data.compareTotal}
          compareLabel={compareLabel}
          higherIsBetter={true}
        />
        <KpiCard
          label={t('ui.revenue.topCategory')}
          value={topCategory?.amount ?? '0'}
          compareLabel={topCategory?.label || '—'}
          higherIsBetter={true}
          onOpen={topCategory ? () => handleSelectFolder(topCategory.id, topCategory.label) : undefined}
        />
        <KpiCard
          label={t('ui.revenue.topEntity')}
          value={topEntity?.amount ?? '0'}
          compareLabel={topEntity?.name || '—'}
          higherIsBetter={true}
        />
      </div>

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

      <DataTable
        title={t('ui.revenue.revenueByFolder')}
        columns={columns}
        data={data.byFolder}
        getRowId={(r) => r.id}
        onRowClick={(r) => handleSelectFolder(r.id, r.label)}
        emptyMessage={t('common.noData')}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={data.byFolder}
              columns={[
                { header: t('ui.col.categoryFolder'), value: (r) => r.label, kind: 'text' },
                { header: t('ui.col.total'), value: (r) => r.amount, kind: 'money' },
              ]}
              filename={exportFilename('revenue', deps)}
            />
            <PrintButton />
          </div>
        }
        mobileCard={(r) => (
          <div className="flex justify-between items-center">
            <span className="font-semibold">{r.label}</span>
            <span className="font-semibold tabular-nums">{formatMoneyFull(r.amount, lang)}</span>
          </div>
        )}
      />
    </div>
  )
}
