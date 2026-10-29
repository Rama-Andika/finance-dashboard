import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, AlertCircle } from 'lucide-react'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import {
  cashPositionMetricOptions,
  runwayMetricOptions,
} from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { CashBalanceCard } from '~/components/neraca/CashBalanceCard'
import { KpiCard } from '~/components/neraca/KpiCard'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { StatusPill } from '~/components/neraca/StatusPill'
import { Button } from '~/components/neraca/Button'
import { ExportCsvButton, formatExportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { PrintHeader } from '~/components/export/PrintHeader'
import { formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatMonthYear, getCompareLabel } from '~/lib/format/date'
import type { Breakdown, Lang } from '~/lib/finance/types'
import type { InTransitDetailItem } from '~/lib/finance/cash-position'

export const Route = createFileRoute('/_authed/cash-position')({
  validateSearch: drillSearchSchema,
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(cashPositionMetricOptions(deps)),
      context.queryClient.ensureQueryData(runwayMetricOptions(deps)),
    ]),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: CashPositionPage,
})

function CashPositionPage() {
  const deps = Route.useLoaderDeps()
  const { data } = useQuery(cashPositionMetricOptions(deps))
  const { data: runwayData } = useQuery(runwayMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  if (!data) return null

  const compareLabel = getCompareLabel(deps.preset, lang)

  // 1. Folders columns
  const folderColumns: ColumnDef<Breakdown, any>[] = [
    {
      accessorKey: 'label',
      header: lang === 'id' ? 'Kategori Kas & Bank' : 'Cash & Bank Category',
      cell: ({ row }) => <span className="nr-name">{row.original.label}</span>,
    },
    {
      accessorKey: 'amount',
      header: lang === 'id' ? 'Saldo (Rp)' : 'Balance (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
  ]

  // 2. In Transit columns
  const inTransitColumns: ColumnDef<InTransitDetailItem, any>[] = [
    {
      accessorKey: 'name',
      header: 'Channel',
      cell: ({ row }) => <span className="nr-name">{row.original.name}</span>,
    },
    {
      accessorKey: 'count',
      header: lang === 'id' ? 'Jml Transaksi' : 'Tx Count',
      meta: { align: 'right' },
      cell: ({ getValue }) => getValue(),
    },
    {
      accessorKey: 'oldestAgeDays',
      header: lang === 'id' ? 'Umur Tertua' : 'Oldest Age',
      cell: ({ getValue }) => `${getValue()} ${lang === 'id' ? 'hari' : 'days'}`,
    },
    {
      accessorKey: 'amount',
      header: lang === 'id' ? 'Nilai (Rp)' : 'Amount (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) =>
        row.original.overThreeDays ? (
          <StatusPill tone="warning">{lang === 'id' ? 'Lewat 3 hari' : 'Over 3 days'}</StatusPill>
        ) : (
          <StatusPill tone="neutral">{lang === 'id' ? 'Lancar' : 'Normal'}</StatusPill>
        ),
    },
  ]

  // 3. Entity balances columns
  const entityColumns: ColumnDef<
    { code: string; name: string; amount: string; isNegative: boolean },
    any
  >[] = [
    {
      accessorKey: 'name',
      header: lang === 'id' ? 'Entitas' : 'Entity',
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="nr-name">{row.original.name}</span>
          <span className="nr-sub">{row.original.code}</span>
          {row.original.isNegative && (
            <span title="Saldo negatif">
              <AlertCircle className="nr-icon nr-icon-sm text-danger" />
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'amount',
      header: lang === 'id' ? 'Saldo (Rp)' : 'Balance (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue, row }) => (
        <span className={row.original.isNegative ? 'text-danger font-semibold' : undefined}>
          {formatMoneyFull(getValue() as string, lang)}
        </span>
      ),
    },
  ]

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PrintHeader
        title={t('nav.cashPosition')}
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

      {/* Reconciliation Notice */}
      {!data.reconciliation.inSync && (
        <Notice
          tone="danger"
          title={
            lang === 'id'
              ? `Saldo GL dan register pencairan selisih ${formatMoneyShort(data.reconciliation.diff, lang)}.`
              : `GL balance and settlement register differ by ${formatMoneyShort(data.reconciliation.diff, lang)}.`
          }
          body={
            lang === 'id'
              ? 'Kemungkinan ada jurnal pencairan yang belum diposting.'
              : 'Likely some settlement journals have not been posted yet.'
          }
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CashBalanceCard
          asOf={data.meta.asOf}
          entityCount={data.byEntity.length}
          cash={data.cash}
          bank={data.bank}
          deposit={data.deposit}
          inTransit={data.inTransit}
        />

        <KpiCard
          label={lang === 'id' ? 'Dana dalam Pencairan' : 'In Transit'}
          value={data.inTransit}
          compareLabel={`${data.inTransitDetail.length} channel`}
          higherIsBetter={false}
        />

        <KpiCard
          label={t('metric.runway')}
          value={
            runwayData?.cashFlowPositive
              ? t('metric.runwayPositive')
              : runwayData?.runwayMonths
                ? `${runwayData.runwayMonths} ${t('metric.months')}`
                : '—'
          }
          compareLabel={
            runwayData?.avgBurn
              ? `${t('metric.avgBurn')}: ${formatMoneyShort(runwayData.avgBurn, lang)}`
              : undefined
          }
          higherIsBetter={true}
        />
      </div>

      {/* Table 1: Kas / Bank per folder */}
      <DataTable
        title={lang === 'id' ? 'Rincian Kas & Bank' : 'Cash & Bank Breakdown'}
        columns={folderColumns}
        data={data.byFolder}
        getRowId={(r) => r.id}
        emptyMessage={t('common.noData')}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={data.byFolder}
              columns={[
                { header: 'Kategori / Folder', value: (r) => r.label, kind: 'text' },
                { header: 'Saldo (Rp)', value: (r) => r.amount, kind: 'money' },
              ]}
              filename={formatExportFilename('cash_position', deps.entity, deps.preset)}
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

      {/* Table 2: Dana Dalam Pencairan per channel */}
      <DataTable
        title={lang === 'id' ? 'Dana Dalam Pencairan per Channel' : 'In Transit by Channel'}
        columns={inTransitColumns}
        data={data.inTransitDetail}
        getRowId={(r) => r.coaId}
        emptyMessage={t('common.noData')}
        mobileCard={(r) => (
          <div className="space-y-1">
            <div className="flex justify-between items-start">
              <span className="font-semibold">{r.name}</span>
              <span className="font-semibold tabular-nums">{formatMoneyFull(r.amount, lang)}</span>
            </div>
            <div className="text-xs text-muted flex justify-between">
              <span>{r.count} transaksi · tertua {r.oldestAgeDays} hari</span>
              {r.overThreeDays && <StatusPill tone="warning">Lewat 3 hari</StatusPill>}
            </div>
          </div>
        )}
      />

      {/* Table 3: Saldo per Entitas */}
      <DataTable
        title={lang === 'id' ? 'Saldo Kas per Entitas' : 'Cash Balance by Entity'}
        columns={entityColumns}
        data={data.byEntity}
        getRowId={(r) => r.code}
        emptyMessage={t('common.noData')}
        mobileCard={(r) => (
          <div className="flex justify-between items-center">
            <div>
              <div className="font-semibold">{r.name}</div>
              <div className="text-xs text-muted font-mono">{r.code}</div>
            </div>
            <span className={`font-semibold tabular-nums ${r.isNegative ? 'text-danger' : ''}`}>
              {formatMoneyFull(r.amount, lang)}
            </span>
          </div>
        )}
      />
    </div>
  )
}
