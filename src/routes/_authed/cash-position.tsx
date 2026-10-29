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
import { useOpenDrill } from '~/components/drill/useOpenDrill'
import { formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatMonthYear, getCompareLabel } from '~/lib/format/date'
import type { Breakdown, Lang } from '~/lib/finance/types'
import type { InTransitDetailItem } from '~/lib/finance/cash-position'

export const Route = createFileRoute('/_authed/cash-position')({
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

  const openDrill = useOpenDrill()

  if (!data) return null

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)

  // Category labels come from the server in neutral form; translate cash/bank here.
  const byFolder: Breakdown[] = data.byFolder.map((c) =>
    c.id === 'cash' || c.id === 'bank' ? { ...c, label: t(`cashCard.${c.id}`) } : c,
  )

  // Cash & bank rows: category (cash/bank) → folder → account; each level opens the matching drill step.
  const categoryIds = new Set(data.byFolder.map((c) => c.id))
  const folderIds = new Set(data.byFolder.flatMap((c) => (c.children ?? []).map((f) => f.id)))
  const openCashRow = (r: Breakdown) => {
    const kind = categoryIds.has(r.id) ? 'section' : folderIds.has(r.id) ? 'folder' : 'account'
    openDrill('cashPosition', [{ kind, id: r.id, label: r.label }])
  }

  // 1. Folders columns
  const folderColumns: ColumnDef<Breakdown, any>[] = [
    {
      accessorKey: 'label',
      header: t('ui.cashPosition.cashBankCategory'),
      cell: ({ row }) => <span className="nr-name">{row.original.label}</span>,
    },
    {
      accessorKey: 'amount',
      header: t('ui.cashPosition.balanceIdr'),
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
  ]

  // 2. In Transit columns
  const inTransitColumns: ColumnDef<InTransitDetailItem, any>[] = [
    {
      accessorKey: 'name',
      header: t('ui.col.channel'),
      cell: ({ row }) => <span className="nr-name">{row.original.name}</span>,
    },
    {
      accessorKey: 'count',
      header: t('ui.cashPosition.txCount'),
      meta: { align: 'right' },
      cell: ({ getValue }) => getValue(),
    },
    {
      accessorKey: 'oldestAgeDays',
      header: t('ui.cashPosition.oldestAge'),
      cell: ({ getValue }) => `${getValue()} ${t('ui.cashPosition.days')}`,
    },
    {
      accessorKey: 'amount',
      header: t('ui.cashPosition.amountIdr'),
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      id: 'status',
      header: t('ui.col.status'),
      cell: ({ row }) =>
        row.original.overThreeDays ? (
          <StatusPill tone="warning">{t('ui.cashPosition.over3Days')}</StatusPill>
        ) : (
          <StatusPill tone="neutral">{t('ui.cashPosition.normal')}</StatusPill>
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
      header: t('ui.cashPosition.entity'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="nr-name">{row.original.name}</span>
          <span className="nr-sub">{row.original.code}</span>
          {row.original.isNegative && (
            <span title={t('ui.col.negativeBalance')}>
              <AlertCircle className="nr-icon nr-icon-sm text-danger" />
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'amount',
      header: t('ui.cashPosition.balanceIdr'),
      meta: { align: 'right' },
      cell: ({ getValue, row }) => (
        <span className={row.original.isNegative ? 'text-danger font-semibold' : undefined}>
          {formatMoneyFull(getValue() as string, lang)}
        </span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PrintHeader
        title={t('nav.cashPosition')}
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

      {/* Reconciliation Notice */}
      {!data.reconciliation.inSync && (
        <Notice
          tone="danger"
          title={
            t('ui.cashPosition.registerDiff', { amount: formatMoneyShort(data.reconciliation.diff, lang) })
          }
          body={
            t('ui.cashPosition.likelySomeSettlementJournalsHave')
          }
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <CashBalanceCard
          asOf={data.meta.asOf}
          entityCount={data.byEntity.length}
          cash={data.cash}
          bank={data.bank}
          deposit={data.deposit}
          inTransit={data.inTransit}
        />

        <KpiCard
          label={t('ui.cashPosition.inTransit')}
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
        title={t('ui.cashPosition.cashBankBreakdown')}
        columns={folderColumns}
        data={byFolder}
        getRowId={(r) => r.id}
        getSubRows={(r) => r.children}
        onRowClick={openCashRow}
        emptyMessage={t('common.noData')}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={byFolder}
              columns={[
                { header: t('ui.col.categoryFolder'), value: (r) => r.label, kind: 'text' },
                { header: t('ui.col.balanceAmount'), value: (r) => r.amount, kind: 'money' },
              ]}
              filename={formatExportFilename('cash_position', deps.entity, deps.from && deps.to ? `${deps.from}_${deps.to}` : deps.preset)}
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
        title={t('ui.cashPosition.inTransitByChannel')}
        columns={inTransitColumns}
        data={data.inTransitDetail}
        getRowId={(r) => r.coaId}
        onRowClick={(r) => openDrill('inTransit', [{ kind: 'channel', id: r.coaId, label: r.name }])}
        emptyMessage={t('common.noData')}
        mobileCard={(r) => (
          <div className="space-y-1">
            <div className="flex justify-between items-start">
              <span className="font-semibold">{r.name}</span>
              <span className="font-semibold tabular-nums">{formatMoneyFull(r.amount, lang)}</span>
            </div>
            <div className="text-xs text-muted flex justify-between">
              <span>{r.count} transaksi · tertua {r.oldestAgeDays} hari</span>
              {r.overThreeDays && <StatusPill tone="warning">{t('ui.col.overThreeDays')}</StatusPill>}
            </div>
          </div>
        )}
      />

      {/* Table 3: Saldo per Entitas */}
      <DataTable
        title={t('ui.cashPosition.cashBalanceByEntity')}
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
