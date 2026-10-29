import { searchUpdater } from '~/lib/filters/search-update'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { apAgingMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { AgingBar } from '~/components/neraca/AgingBar'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { Button } from '~/components/neraca/Button'
import { ExportCsvButton, formatExportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { PrintHeader } from '~/components/export/PrintHeader'
import { formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatMonthYear, getCompareLabel } from '~/lib/format/date'
import { sum } from '~/lib/finance/money'
import type { Lang } from '~/lib/finance/types'
import type { VendorAgingSummary } from '~/lib/finance/apar'

export const Route = createFileRoute('/_authed/payables')({
  validateSearch: drillSearchSchema,
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(apAgingMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: PayablesPage,
})

function PayablesPage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data } = useQuery(apAgingMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  if (!data) return null

  const handleSelectBucket = (bucket: string) => {
    navigate({
      to: '/payables',
      search: searchUpdater((prev) => ({
        ...prev,
        drill: {
          metric: 'apAging',
          steps: [{ kind: 'bucket', id: bucket, label: bucket }],
        },
      })),
    })
  }

  const handleSelectVendor = (vendor: VendorAgingSummary) => {
    navigate({
      to: '/payables',
      search: searchUpdater((prev) => ({
        ...prev,
        drill: {
          metric: 'apAging',
          steps: [{ kind: 'vendor', id: vendor.vendorId, label: vendor.name }],
        },
      })),
    })
  }

  const compareLabel = getCompareLabel(deps.preset, lang)

  // Not due sum (sum of 4 due buckets)
  const notDueSum = sum([
    data.buckets.due90plus,
    data.buckets.due61_90,
    data.buckets.due31_60,
    data.buckets.due1_30,
  ])

  const agingSegments = [
    {
      key: 'notDue' as const,
      label: t('ui.payables.notDue'),
      amount: notDueSum,
    },
    {
      key: 'd0_30' as const,
      label: '0 – 30 hari',
      amount: data.buckets.overdue0_30,
    },
    {
      key: 'd31_60' as const,
      label: '31 – 60 hari',
      amount: data.buckets.overdue31_60,
    },
    {
      key: 'd61_90' as const,
      label: '61 – 90 hari',
      amount: data.buckets.overdue61_90,
    },
    {
      key: 'd90plus' as const,
      label: '> 90 hari',
      amount: data.buckets.overdue90plus,
    },
  ]

  const columns: ColumnDef<VendorAgingSummary, any>[] = [
    {
      accessorKey: 'name',
      header: t('ui.col.vendor'),
      cell: ({ row }) => (
        <div>
          <span className="nr-name">{row.original.name || t('ui.col.unknownVendor')}</span>
          <span className="nr-sub">{row.original.code}</span>
        </div>
      ),
    },
    {
      accessorKey: 'total',
      header: t('ui.payables.totalPayableIdr'),
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      id: 'overdue',
      header: t('ui.payables.overdueIdr'),
      meta: { align: 'right' },
      cell: ({ row }) => {
        const vendorOverdue = sum([
          row.original.buckets.overdue0_30,
          row.original.buckets.overdue31_60,
          row.original.buckets.overdue61_90,
          row.original.buckets.overdue90plus,
        ])
        return (
          <span className="text-warning font-semibold">
            {formatMoneyFull(vendorOverdue, lang)}
          </span>
        )
      },
    },
  ]

  return (
    <div className="space-y-6">
      <PrintHeader
        title={t('nav.payables')}
        entity={deps.entity}
        preset={deps.preset}
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

      {/* Reconciliation check */}
      {!data.reconciliation.inSync && (
        <Notice
          tone="warning"
          title={
            t('ui.payables.reconciliationDiff', { amount: formatMoneyShort(data.reconciliation.diff, lang) })
          }
          body={
            t('ui.payables.reconciliationDetail', {
              gl: formatMoneyFull(data.reconciliation.gl, lang),
              cards: formatMoneyFull(data.reconciliation.subledger, lang),
            })
          }
        />
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t('ui.payables.accountsPayableNet')}
          value={data.total}
          compareValue={data.compareTotal}
          compareLabel={compareLabel}
          higherIsBetter={false}
        />
        <KpiCard
          label={t('ui.payables.unpaidBills')}
          value={data.unpaidBills}
          higherIsBetter={false}
        />
        <KpiCard
          label={t('ui.payables.totalOverdue')}
          value={data.overdueSubtotal}
          higherIsBetter={false}
        />
        <KpiCard
          label={t('ui.payables.vendorCredits')}
          value={data.vendorCredits}
          higherIsBetter={true}
        />
      </div>

      {/* Aging Bar */}
      <AgingBar
        title={t('ui.payables.accountsPayableAging')}
        asOf={data.meta.asOf}
        total={data.total}
        segments={agingSegments}
        lang={lang}
        onSelect={handleSelectBucket}
      />

      {/* Vendor Table */}
      <DataTable
        title={t('ui.payables.payableByVendor')}
        columns={columns}
        data={data.byVendor}
        getRowId={(r) => r.vendorId}
        onRowClick={handleSelectVendor}
        emptyMessage={t('common.noData')}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={data.byVendor}
              columns={[
                { header: t('ui.col.vendorCode'), value: (r) => r.code, kind: 'text' },
                { header: t('ui.col.vendorName'), value: (r) => r.name || t('ui.col.unknownVendor'), kind: 'text' },
                { header: t('ui.col.totalPayable'), value: (r) => r.total, kind: 'money' },
                {
                  header: t('ui.col.overdueAmount'),
                  value: (r) =>
                    sum([
                      r.buckets.overdue0_30,
                      r.buckets.overdue31_60,
                      r.buckets.overdue61_90,
                      r.buckets.overdue90plus,
                    ]),
                  kind: 'money',
                },
              ]}
              filename={formatExportFilename('payables', deps.entity, deps.preset)}
            />
            <PrintButton />
          </div>
        }
        mobileCard={(r) => {
          const vendorOverdue = sum([
            r.buckets.overdue0_30,
            r.buckets.overdue31_60,
            r.buckets.overdue61_90,
            r.buckets.overdue90plus,
          ])
          return (
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold">{r.name || t('ui.col.unknownVendor')}</span>
                  <span className="text-xs text-muted block font-mono">{r.code}</span>
                </div>
                <span className="font-semibold tabular-nums">{formatMoneyFull(r.total, lang)}</span>
              </div>
              {Number(vendorOverdue) > 0 && (
                <div className="text-xs text-warning flex justify-between">
                  <span>{t('ui.payables.overdue')}</span>
                  <span>{formatMoneyFull(vendorOverdue, lang)}</span>
                </div>
              )}
            </div>
          )
        }}
      />
    </div>
  )
}
