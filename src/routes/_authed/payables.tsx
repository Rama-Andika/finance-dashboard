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
      search: (prev: any) => ({
        ...prev,
        drill: {
          metric: 'apAging',
          steps: [{ kind: 'bucket', id: bucket, label: bucket }],
        },
      }),
    })
  }

  const handleSelectVendor = (vendor: VendorAgingSummary) => {
    navigate({
      to: '/payables',
      search: (prev: any) => ({
        ...prev,
        drill: {
          metric: 'apAging',
          steps: [{ kind: 'vendor', id: vendor.vendorId, label: vendor.name }],
        },
      }),
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
      label: lang === 'id' ? 'Belum jatuh tempo' : 'Not due',
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
      header: 'Vendor',
      cell: ({ row }) => (
        <div>
          <span className="nr-name">{row.original.name}</span>
          <span className="nr-sub">{row.original.code}</span>
        </div>
      ),
    },
    {
      accessorKey: 'total',
      header: lang === 'id' ? 'Total Utang (Rp)' : 'Total Payable (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      id: 'overdue',
      header: lang === 'id' ? 'Jatuh Tempo (Rp)' : 'Overdue (IDR)',
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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
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
            lang === 'id'
              ? `Selisih saldo kontrol GL dan kartu utang: ${formatMoneyShort(data.reconciliation.diff, lang)}.`
              : `Discrepancy between GL control and AP cards: ${formatMoneyShort(data.reconciliation.diff, lang)}.`
          }
          body={
            lang === 'id'
              ? `GL: ${formatMoneyFull(data.reconciliation.gl, lang)} · Kartu: ${formatMoneyFull(data.reconciliation.subledger, lang)}`
              : `GL: ${formatMoneyFull(data.reconciliation.gl, lang)} · Cards: ${formatMoneyFull(data.reconciliation.subledger, lang)}`
          }
        />
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={lang === 'id' ? 'Utang Usaha (Neto)' : 'Accounts Payable (Net)'}
          value={data.total}
          compareValue={data.compareTotal}
          compareLabel={compareLabel}
          higherIsBetter={false}
        />
        <KpiCard
          label={lang === 'id' ? 'Tagihan Belum Lunas' : 'Unpaid Bills'}
          value={data.unpaidBills}
          higherIsBetter={false}
        />
        <KpiCard
          label={lang === 'id' ? 'Lewat Jatuh Tempo' : 'Total Overdue'}
          value={data.overdueSubtotal}
          higherIsBetter={false}
        />
        <KpiCard
          label={lang === 'id' ? 'Kredit & Retur Vendor' : 'Vendor Credits'}
          value={data.vendorCredits}
          higherIsBetter={true}
        />
      </div>

      {/* Aging Bar */}
      <AgingBar
        title={lang === 'id' ? 'Umur Utang Usaha' : 'Accounts Payable Aging'}
        asOf={data.meta.asOf}
        total={data.total}
        segments={agingSegments}
        lang={lang}
        onSelect={handleSelectBucket}
      />

      {/* Vendor Table */}
      <DataTable
        title={lang === 'id' ? 'Rincian Utang per Vendor' : 'Payable by Vendor'}
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
                { header: 'Kode Vendor', value: (r) => r.code, kind: 'text' },
                { header: 'Nama Vendor', value: (r) => r.name, kind: 'text' },
                { header: 'Total Utang (Rp)', value: (r) => r.total, kind: 'money' },
                {
                  header: 'Jatuh Tempo (Rp)',
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
                  <span className="font-semibold">{r.name}</span>
                  <span className="text-xs text-muted block font-mono">{r.code}</span>
                </div>
                <span className="font-semibold tabular-nums">{formatMoneyFull(r.total, lang)}</span>
              </div>
              {Number(vendorOverdue) > 0 && (
                <div className="text-xs text-warning flex justify-between">
                  <span>{lang === 'id' ? 'Lewat tempo' : 'Overdue'}</span>
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
