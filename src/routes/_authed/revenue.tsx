import { searchUpdater } from '~/lib/filters/search-update'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useMemo } from 'react'
import { Download } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { revenueMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { DonutBreakdown } from '~/components/neraca/DonutBreakdown'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { Button } from '~/components/neraca/Button'
import { ExportCsvButton, formatExportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { PrintHeader } from '~/components/export/PrintHeader'
import { formatAxisShort, formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatMonth, formatMonthYear, getCompareLabel } from '~/lib/format/date'
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

  const topCategory = useMemo(() => {
    if (!data?.byFolder || data.byFolder.length === 0) return null
    return [...data.byFolder].sort((a, b) => Number(b.amount) - Number(a.amount))[0]
  }, [data?.byFolder])

  const topEntity = useMemo(() => {
    if (!data?.byEntity || data.byEntity.length === 0) return null
    return [...data.byEntity].sort((a, b) => Number(b.amount) - Number(a.amount))[0]
  }, [data?.byEntity])

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

  // Chart data
  const chartData = data.trend.map((m) => ({
    month: m.month,
    displayMonth: formatMonth(m.month, lang),
    // Display only: recharts needs a JS number for bar height; the exact amount stays in `rawAmount`.
    amountNum: Math.max(0, Number(m.amount) || 0),
    rawAmount: m.amount,
  }))

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

      {/* KPI Row */}
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

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Monthly Trend Bar Chart */}
        <div className="nr-card lg:col-span-2 space-y-4">
          <div className="nr-card-head" style={{ margin: 0 }}>
            <h3 className="nr-card-title">
              {t('ui.revenue.monthlyRevenueTrend')}
            </h3>
            <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
              {formatMoneyShort(data.total, lang)}
            </span>
          </div>

          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--chart-grid)"
                />
                <XAxis
                  dataKey="displayMonth"
                  axisLine={{ stroke: 'var(--chart-axis)' }}
                  tickLine={false}
                  tick={{ fill: 'var(--ink-muted)', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
                  tickFormatter={(val) => formatAxisShort(val, lang)}
                  domain={[0, (dataMax: number) => (dataMax > 0 ? dataMax * 1.15 : 1000000)]}
                />
                <RechartsTooltip
                  cursor={{ fill: 'var(--surface-hover)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length > 0) {
                      const item = payload[0]?.payload
                      return (
                        <div className="nr-tooltip">
                          <div className="font-semibold">{formatMonthYear(item.month, lang)}</div>
                          <div className="tabular-nums font-semibold mt-1">
                            {formatMoneyFull(item.rawAmount, lang)}
                          </div>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar
                  dataKey="amountNum"
                  fill="var(--chart-income)"
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Donut Composition */}
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

      {/* Folder breakdown table */}
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
              filename={formatExportFilename('revenue', deps.entity, deps.from && deps.to ? `${deps.from}_${deps.to}` : deps.preset)}
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
