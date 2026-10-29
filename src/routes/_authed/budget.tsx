import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { budgetMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { DeltaPill } from '~/components/neraca/DeltaPill'
import { Button } from '~/components/neraca/Button'
import { ExportCsvButton, formatExportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { PrintHeader } from '~/components/export/PrintHeader'
import { useOpenDrill } from '~/components/drill/useOpenDrill'
import { formatMoneyFull } from '~/lib/format/number'
import { formatMonthYear } from '~/lib/format/date'
import type { Lang } from '~/lib/core/types'
import type { BudgetRow } from '~/lib/finance/pnl/budget'

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

  const columns: ColumnDef<BudgetRow, unknown>[] = [
    {
      accessorKey: 'name',
      header: t('ui.budget.budgetItem'),
      cell: ({ row }) => {
        const isHeader = Boolean(row.original.children && row.original.children.length > 0)
        return (
          <span className={isHeader ? 'font-bold text-ink' : undefined}>
            {row.original.name}
          </span>
        )
      },
    },
    {
      accessorKey: 'budget',
      header: t('ui.budget.budgetIdr'),
      meta: { align: 'right' },
      cell: ({ getValue, row }) => {
        const isHeader = Boolean(row.original.children && row.original.children.length > 0)
        return (
          <span className={isHeader ? 'font-bold' : undefined}>
            {formatMoneyFull(getValue() as string, lang)}
          </span>
        )
      },
    },
    {
      accessorKey: 'actual',
      header: t('ui.budget.actualIdr'),
      meta: { align: 'right' },
      cell: ({ getValue, row }) => {
        const isHeader = Boolean(row.original.children && row.original.children.length > 0)
        return (
          <span className={isHeader ? 'font-bold' : undefined}>
            {formatMoneyFull(getValue() as string, lang)}
          </span>
        )
      },
    },
    {
      accessorKey: 'variance',
      header: t('ui.budget.varianceIdr'),
      meta: { align: 'right' },
      cell: ({ getValue, row }) => {
        const isHeader = Boolean(row.original.children && row.original.children.length > 0)
        return (
          <span className={isHeader ? 'font-bold' : undefined}>
            {formatMoneyFull(getValue() as string, lang)}
          </span>
        )
      },
    },
    {
      id: 'variancePercent',
      header: t('ui.col.variancePct'),
      meta: { align: 'right' },
      cell: ({ row }) => (
        <DeltaPill
          change={row.original.variancePercent}
          higherIsBetter={row.original.higherIsBetter}
          lang={lang}
        />
      ),
    },
  ]

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
              ? `Selisih: ${data.summary.variancePercent}%`
              : undefined
          }
          higherIsBetter={true}
        />
      </div>

      {/* Budget vs Actual Table */}
      <DataTable
        title={t('ui.budget.budgetVsActualPerformance')}
        columns={columns}
        data={data.rows}
        getSubRows={(r) => r.children}
        getRowId={(r) => r.coaId}
        onRowClick={(r) => openDrill('budget', [{ kind: 'account', id: r.coaId, label: r.name }])}
        emptyMessage={t('common.noData')}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={data.rows}
              columns={[
                { header: t('ui.col.accountCode'), value: (r) => r.code, kind: 'text' },
                { header: t('ui.col.accountCategory'), value: (r) => r.name, kind: 'text' },
                { header: t('ui.col.budget'), value: (r) => r.budget, kind: 'money' },
                { header: t('ui.col.actual'), value: (r) => r.actual, kind: 'money' },
                { header: t('ui.col.variance'), value: (r) => r.variance, kind: 'money' },
                { header: t('ui.col.variancePct'), value: (r) => (r.variancePercent ? `${r.variancePercent}%` : ''), kind: 'text' },
              ]}
              filename={formatExportFilename('budget_vs_actual', deps.entity, deps.from && deps.to ? `${deps.from}_${deps.to}` : deps.preset)}
            />
            <PrintButton />
          </div>
        }
        mobileCard={(r) => {
          const isHeader = Boolean(r.children && r.children.length > 0)
          return (
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <span className={isHeader ? 'font-bold' : undefined}>{r.name}</span>
                <DeltaPill
                  change={r.variancePercent}
                  higherIsBetter={r.higherIsBetter}
                  lang={lang}
                />
              </div>
              <div className="text-xs text-muted flex justify-between">
                <span>Anggaran: {formatMoneyFull(r.budget, lang)}</span>
                <span>Aktual: {formatMoneyFull(r.actual, lang)}</span>
              </div>
            </div>
          )
        }}
      />
    </div>
  )
}
