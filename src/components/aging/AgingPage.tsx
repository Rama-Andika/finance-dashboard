import { useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { searchUpdater } from '~/lib/filters/search-update'
import type { MetricInput } from '~/lib/filters/search-schema'
import type { AgingBucket } from '~/lib/finance/ap-ar/aging'
import { AGING_PARTY_SORT_KEYS, type AgingPartyRow } from '~/lib/finance/ap-ar/aging-parties'
import { sum } from '~/lib/core/money'
import type { Lang, MetricMeta, Money } from '~/lib/core/types'
import { formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatMonthYear, getCompareLabel } from '~/lib/format/date'
import { agingPartiesOptions, exportAgingParties } from '~/queries/metrics.queries'
import { useTableSearch } from '~/components/neraca/useTableSearch'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { AgingBar } from '~/components/neraca/AgingBar'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { ExportCsvButton, formatExportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { PrintHeader } from '~/components/export/PrintHeader'

/** The part of an AP or AR aging result that the page shows (both sides share it). */
export type AgingPageData = {
  meta: MetricMeta
  total: Money
  compareTotal: Money | null
  buckets: Record<AgingBucket, Money>
  overdueSubtotal: Money
  reconciliation: { gl: Money; subledger: Money; diff: Money; inSync: boolean }
}

export type AgingKpi = { label: string; value: Money; higherIsBetter: boolean }

type SideConfig = {
  route: '/payables' | '/receivables'
  drillMetric: 'apAging' | 'arAging'
  partyKind: 'vendor' | 'customer'
  exportName: string
  navKey: string
  /** i18n keys of this side (vendor wording for AP, customer wording for AR) */
  keys: {
    notDue: string
    partyColumn: string
    unknownParty: string
    totalColumn: string
    overdueColumn: string
    reconciliationDiff: string
    reconciliationDetail: string
    agingTitle: string
    tableTitle: string
    exportPartyCode: string
    exportPartyName: string
    exportTotal: string
    overdueLabel: string
  }
}

const SIDES: Record<'ap' | 'ar', SideConfig> = {
  ap: {
    route: '/payables',
    drillMetric: 'apAging',
    partyKind: 'vendor',
    exportName: 'payables',
    navKey: 'nav.payables',
    keys: {
      notDue: 'ui.payables.notDue',
      partyColumn: 'ui.col.vendor',
      unknownParty: 'ui.col.unknownVendor',
      totalColumn: 'ui.payables.totalPayableIdr',
      overdueColumn: 'ui.payables.overdueIdr',
      reconciliationDiff: 'ui.payables.reconciliationDiff',
      reconciliationDetail: 'ui.payables.reconciliationDetail',
      agingTitle: 'ui.payables.accountsPayableAging',
      tableTitle: 'ui.payables.payableByVendor',
      exportPartyCode: 'ui.col.vendorCode',
      exportPartyName: 'ui.col.vendorName',
      exportTotal: 'ui.col.totalPayable',
      overdueLabel: 'ui.payables.overdue',
    },
  },
  ar: {
    route: '/receivables',
    drillMetric: 'arAging',
    partyKind: 'customer',
    exportName: 'receivables',
    navKey: 'nav.receivables',
    keys: {
      notDue: 'ui.receivables.notDue',
      partyColumn: 'ui.receivables.customer',
      unknownParty: 'ui.col.unknownCustomer',
      totalColumn: 'ui.receivables.totalReceivableIdr',
      overdueColumn: 'ui.receivables.overdueIdr',
      reconciliationDiff: 'ui.receivables.reconciliationDiff',
      reconciliationDetail: 'ui.receivables.reconciliationDetail',
      agingTitle: 'ui.receivables.accountsReceivableAging',
      tableTitle: 'ui.receivables.receivablesByCustomer',
      exportPartyCode: 'ui.col.customerCode',
      exportPartyName: 'ui.col.customerName',
      exportTotal: 'ui.col.totalReceivable',
      overdueLabel: 'ui.receivables.overdue',
    },
  },
}

/** Payables (AP) and Receivables (AR) pages: same layout, different wording, KPIs and drill metric. */
export function AgingPage({
  side,
  data,
  deps,
  kpis,
}: {
  side: 'ap' | 'ar'
  data: AgingPageData
  deps: MetricInput
  /** Four KPI cards; the first one also shows the comparison with the previous period. */
  kpis: [AgingKpi, AgingKpi, AgingKpi, AgingKpi]
}) {
  const cfg = SIDES[side]
  const navigate = useNavigate()
  const { t, i18n } = useTranslation()
  const table = useTableSearch(AGING_PARTY_SORT_KEYS)
  const parties = useQuery(agingPartiesOptions({ ...deps, side, ...table.query }))
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  const openDrill = (kind: 'bucket' | 'vendor' | 'customer', id: string, label: string) => {
    navigate({
      to: cfg.route,
      resetScroll: false,
      search: searchUpdater((prev) => ({
        ...prev,
        drill: { metric: cfg.drillMetric, steps: [{ kind, id, label }] },
      })),
    })
  }

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)
  const preset = deps.from && deps.to ? `${deps.from} – ${deps.to}` : deps.preset
  const filePeriod = deps.from && deps.to ? `${deps.from}_${deps.to}` : deps.preset

  // Not due = the four "due in the future" buckets together
  const notDueSum = sum([data.buckets.due90plus, data.buckets.due61_90, data.buckets.due31_60, data.buckets.due1_30])
  const agingSegments = [
    { key: 'notDue' as const, label: t(cfg.keys.notDue), amount: notDueSum },
    { key: 'd0_30' as const, label: t('agingBucket.d0_30'), amount: data.buckets.overdue0_30 },
    { key: 'd31_60' as const, label: t('agingBucket.d31_60'), amount: data.buckets.overdue31_60 },
    { key: 'd61_90' as const, label: t('agingBucket.d61_90'), amount: data.buckets.overdue61_90 },
    { key: 'd90plus' as const, label: t('agingBucket.d90plus'), amount: data.buckets.overdue90plus },
  ]

  const partyName = (r: AgingPartyRow) => r.name || t(cfg.keys.unknownParty)

  const columns: ColumnDef<AgingPartyRow, unknown>[] = [
    {
      accessorKey: 'name',
      meta: { sortKey: 'name' },
      header: t(cfg.keys.partyColumn),
      cell: ({ row }) => (
        <div>
          <span className="nr-name">{partyName(row.original)}</span>
          <span className="nr-sub">{row.original.code}</span>
        </div>
      ),
    },
    {
      accessorKey: 'total',
      header: t(cfg.keys.totalColumn),
      meta: { align: 'right', sortKey: 'total', sortDefault: 'desc' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      id: 'overdue',
      header: t(cfg.keys.overdueColumn),
      meta: { align: 'right', sortKey: 'overdue', sortDefault: 'desc' },
      cell: ({ row }) => (
        <span className="text-warning font-semibold">{formatMoneyFull(row.original.overdue, lang)}</span>
      ),
    },
  ]

  return (
    <div className="space-y-6">
      <PrintHeader title={t(cfg.navKey)} entity={deps.entity} preset={preset} asOf={data.meta.asOf} />
      {data.meta.hasOpenPeriod && (
        <Notice
          tone="warning"
          title={t('metric.openPeriodWarning', { month: formatMonthYear(data.meta.asOf, lang) })}
        />
      )}
      {data.meta.missingMonths.length > 0 && (
        <Notice tone="warning" title={t('metric.missingMonthsWarning')} body={data.meta.missingMonths.join(', ')} />
      )}

      {/* Reconciliation check */}
      {!data.reconciliation.inSync && (
        <Notice
          tone="warning"
          title={t(cfg.keys.reconciliationDiff, { amount: formatMoneyShort(data.reconciliation.diff, lang) })}
          body={t(cfg.keys.reconciliationDetail, {
            gl: formatMoneyFull(data.reconciliation.gl, lang),
            cards: formatMoneyFull(data.reconciliation.subledger, lang),
          })}
        />
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpis.map((kpi, i) => (
          <KpiCard
            key={kpi.label}
            label={kpi.label}
            value={kpi.value}
            higherIsBetter={kpi.higherIsBetter}
            {...(i === 0 ? { compareValue: data.compareTotal, compareLabel } : {})}
          />
        ))}
      </div>

      {/* Aging Bar */}
      <AgingBar
        title={t(cfg.keys.agingTitle)}
        asOf={data.meta.asOf}
        total={data.total}
        segments={agingSegments}
        lang={lang}
        onSelect={(bucket) => openDrill('bucket', bucket, bucket)}
      />

      {/* Party table */}
      <DataTable
        title={t(cfg.keys.tableTitle)}
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
        onRowClick={(r) => openDrill(cfg.partyKind, r.id, r.name)}
        emptyMessage={t('common.noData')}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              loadRows={() =>
                exportAgingParties({ ...deps, side, sortBy: table.query.sortBy, sortDir: table.query.sortDir })
              }
              columns={[
                { header: t(cfg.keys.exportPartyCode), value: (r) => r.code, kind: 'text' },
                { header: t(cfg.keys.exportPartyName), value: partyName, kind: 'text' },
                { header: t(cfg.keys.exportTotal), value: (r) => r.total, kind: 'money' },
                { header: t('ui.col.overdueAmount'), value: (r) => r.overdue, kind: 'money' },
              ]}
              filename={formatExportFilename(cfg.exportName, deps.entity, filePeriod)}
            />
            <PrintButton />
          </div>
        }
        mobileCard={(r) => (
          <div className="space-y-1">
            <div className="flex justify-between items-start">
              <div>
                <span className="font-semibold">{partyName(r)}</span>
                <span className="text-xs text-ink-muted block font-mono">{r.code}</span>
              </div>
              <span className="font-semibold tabular-nums">{formatMoneyFull(r.total, lang)}</span>
            </div>
            {Number(r.overdue) > 0 && (
              <div className="text-xs text-warning flex justify-between">
                <span>{t(cfg.keys.overdueLabel)}</span>
                <span>{formatMoneyFull(r.overdue, lang)}</span>
              </div>
            )}
          </div>
        )}
      />
    </div>
  )
}
