import { searchUpdater } from '~/lib/filters/search-update'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { tableSearchSchema } from '~/lib/table/query'
import { AGING_PARTY_SORT_KEYS, type AgingPartyRow } from '~/lib/finance/aging-parties'
import { useTableSearch } from '~/components/neraca/useTableSearch'
import { arAgingMetricOptions, agingPartiesOptions, exportAgingParties } from '~/queries/metrics.queries'
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

export const Route = createFileRoute('/_authed/receivables')({
  validateSearch: drillSearchSchema.extend(tableSearchSchema(AGING_PARTY_SORT_KEYS).shape),
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    from: search.from,
    to: search.to,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(arAgingMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: ReceivablesPage,
})

function ReceivablesPage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data } = useQuery(arAgingMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const table = useTableSearch(AGING_PARTY_SORT_KEYS)
  const parties = useQuery(
    agingPartiesOptions({ ...deps, side: 'ar', ...table.query }),
  )
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  if (!data) return null

  const handleSelectBucket = (bucket: string) => {
    navigate({
      to: '/receivables',
      resetScroll: false,
      search: searchUpdater((prev) => ({
        ...prev,
        drill: {
          metric: 'arAging',
          steps: [{ kind: 'bucket', id: bucket, label: bucket }],
        },
      })),
    })
  }

  const handleSelectCustomer = (customer: AgingPartyRow) => {
    navigate({
      to: '/receivables',
      resetScroll: false,
      search: searchUpdater((prev) => ({
        ...prev,
        drill: {
          metric: 'arAging',
          steps: [{ kind: 'customer', id: customer.id, label: customer.name }],
        },
      })),
    })
  }

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)

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
      label: t('ui.receivables.notDue'),
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

  const columns: ColumnDef<AgingPartyRow, any>[] = [
    {
      accessorKey: 'name',
      meta: { sortKey: 'name' },
      header: t('ui.receivables.customer'),
      cell: ({ row }) => (
        <div>
          <span className="nr-name">{row.original.name || t('ui.col.unknownCustomer')}</span>
          <span className="nr-sub">{row.original.code}</span>
        </div>
      ),
    },
    {
      accessorKey: 'total',
      header: t('ui.receivables.totalReceivableIdr'),
      meta: { align: 'right', sortKey: 'total', sortDefault: 'desc' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      id: 'overdue',
      header: t('ui.receivables.overdueIdr'),
      meta: { align: 'right', sortKey: 'overdue', sortDefault: 'desc' },
      cell: ({ row }) => (
        <span className="text-warning font-semibold">{formatMoneyFull(row.original.overdue, lang)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PrintHeader
        title={t('nav.receivables')}
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

      {/* Reconciliation check */}
      {!data.reconciliation.inSync && (
        <Notice
          tone="warning"
          title={
            t('ui.receivables.reconciliationDiff', { amount: formatMoneyShort(data.reconciliation.diff, lang) })
          }
          body={
            t('ui.receivables.reconciliationDetail', {
              gl: formatMoneyFull(data.reconciliation.gl, lang),
              cards: formatMoneyFull(data.reconciliation.subledger, lang),
            })
          }
        />
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label={t('ui.receivables.accountsReceivableNet')}
          value={data.total}
          compareValue={data.compareTotal}
          compareLabel={compareLabel}
          higherIsBetter={true}
        />
        <KpiCard
          label={t('ui.receivables.unpaidInvoices')}
          value={data.unpaidInvoices}
          higherIsBetter={true}
        />
        <KpiCard
          label={t('ui.receivables.totalOverdue')}
          value={data.overdueSubtotal}
          higherIsBetter={false}
        />
        <KpiCard
          label={t('ui.receivables.nonTradeReceivables')}
          value={data.nonTrade}
          higherIsBetter={true}
        />
      </div>

      {/* Aging Bar */}
      <AgingBar
        title={t('ui.receivables.accountsReceivableAging')}
        asOf={data.meta.asOf}
        total={data.total}
        segments={agingSegments}
        lang={lang}
        onSelect={handleSelectBucket}
      />

      {/* Customer Table */}
      <DataTable
        title={t('ui.receivables.receivablesByCustomer')}
        columns={columns}
        data={parties.data?.rows ?? []}
        getRowId={(r) => r.id}
        sort={table.sort}
        onSortChange={table.setSort}
        pagination={
          parties.data
            ? { page: parties.data.page, pageSize: parties.data.pageSize, total: parties.data.total }
            : undefined
        }
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        isFetching={parties.isFetching}
        onRowClick={handleSelectCustomer}
        emptyMessage={t('common.noData')}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              loadRows={() =>
                exportAgingParties({
                  ...deps,
                  side: 'ar',
                  sortBy: table.query.sortBy,
                  sortDir: table.query.sortDir,
                })
              }
              columns={[
                { header: t('ui.col.customerCode'), value: (r) => r.code, kind: 'text' },
                { header: t('ui.col.customerName'), value: (r) => r.name || t('ui.col.unknownCustomer'), kind: 'text' },
                { header: t('ui.col.totalReceivable'), value: (r) => r.total, kind: 'money' },
                {
                  header: t('ui.col.overdueAmount'),
                  value: (r) => r.overdue,
                  kind: 'money',
                },
              ]}
              filename={formatExportFilename('receivables', deps.entity, deps.from && deps.to ? `${deps.from}_${deps.to}` : deps.preset)}
            />
            <PrintButton />
          </div>
        }
        mobileCard={(r) => {
          return (
            <div className="space-y-1">
              <div className="flex justify-between items-start">
                <div>
                  <span className="font-semibold">{r.name || t('ui.col.unknownCustomer')}</span>
                  <span className="text-xs text-muted block font-mono">{r.code}</span>
                </div>
                <span className="font-semibold tabular-nums">{formatMoneyFull(r.total, lang)}</span>
              </div>
              {Number(r.overdue) > 0 && (
                <div className="text-xs text-warning flex justify-between">
                  <span>{t('ui.receivables.overdue')}</span>
                  <span>{formatMoneyFull(r.overdue, lang)}</span>
                </div>
              )}
            </div>
          )
        }}
      />
    </div>
  )
}
