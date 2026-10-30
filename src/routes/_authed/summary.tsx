import { translateLabel } from '~/lib/core/i18n-label'
import { searchUpdater } from '~/lib/filters/search-update'
import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import { summaryMetricOptions, paymentBillsOptions, exportPaymentBills } from '~/queries/metrics.queries'
import { tableSearchSchema } from '~/lib/table/query'
import { PAYMENT_BILL_SORT_KEYS, type BillScope } from '~/lib/finance/ap-ar/payment-plan-bills'
import { useTableSearch } from '~/components/neraca/useTableSearch'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { Tabs } from '~/components/neraca/Tabs'
import { CashBalanceCard } from '~/components/neraca/CashBalanceCard'
import { KpiCard } from '~/components/neraca/KpiCard'
import { CashflowChart } from '~/components/neraca/CashflowChart'
import { DonutBreakdown } from '~/components/neraca/DonutBreakdown'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { PlanStatusPill } from '~/components/neraca/PlanStatusPill'
import { ExportCsvButton, formatExportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { PrintHeader } from '~/components/export/PrintHeader'
import { formatMoneyFull, formatPercent } from '~/lib/format/number'
import { formatDate, formatMonthYear, getCompareLabel } from '~/lib/format/date'
import type { Lang } from '~/lib/core/types'
import type { CsvColumn } from '~/lib/format/csv'
import type { PaymentPlanBill } from '~/lib/finance/ap-ar/payment-plan'

export const Route = createFileRoute('/_authed/summary')({
  validateSearch: drillSearchSchema.extend(tableSearchSchema(PAYMENT_BILL_SORT_KEYS).shape),
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    from: search.from,
    to: search.to,
    p13: search.p13,

  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(summaryMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: SummaryPage,
})

function SummaryPage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data } = useQuery(summaryMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const table = useTableSearch(PAYMENT_BILL_SORT_KEYS)
  const [billScope, setBillScope] = useState<BillScope>('due')
  const bills = useQuery(paymentBillsOptions({ entity: deps.entity, preset: deps.preset, from: deps.from, to: deps.to, p13: deps.p13, ...table.query, scope: billScope }))
  // While the first page loads, assume the status column is in use so the table does not jump.
  const planStatusInUse = bills.data?.planStatusInUse ?? true
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  const [donutTab, setDonutTab] = useState<'revenue' | 'expense'>('revenue')

  if (!data) return null

  const compareLabel = getCompareLabel(deps.from && deps.to ? 'custom' : deps.preset, lang)


  const columns: ColumnDef<PaymentPlanBill, unknown>[] = [
    {
      accessorKey: 'vendorName',
      meta: { sortKey: 'vendorName' },
      header: t('ui.col.vendor'),
      cell: ({ row }) => (
        <div>
          <span className="nr-name">{row.original.vendorName}</span>
          <span className="nr-sub">{row.original.invoiceNumber}</span>
        </div>
      ),
    },
    {
      accessorKey: 'dueDate',
      meta: { sortKey: 'dueDate' },
      header: t('ui.col.dueDate'),
      cell: ({ getValue }) => formatDate(getValue() as string, lang),
    },
    {
      accessorKey: 'balance',
      header: t('ui.col.balance'),
      meta: { align: 'right', sortKey: 'balance', sortDefault: 'desc' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
  ]

  if (planStatusInUse) {
    columns.push({
      accessorKey: 'status',
      meta: { sortKey: 'status' },
      header: t('ui.col.status'),
      cell: ({ row }) => <PlanStatusPill status={row.original.status} />,
    })
  }

  const exportColumns: CsvColumn<PaymentPlanBill>[] = [
    { header: t('ui.col.billNumber'), value: (r) => r.invoiceNumber, kind: 'text' },
    { header: t('ui.col.vendor'), value: (r) => r.vendorName, kind: 'text' },
    { header: t('ui.col.dueDate'), value: (r) => r.dueDate, kind: 'date' },
    { header: t('ui.col.payableBalance'), value: (r) => r.balance, kind: 'money' },
  ]
  if (planStatusInUse) {
    exportColumns.push({ header: t('ui.col.planStatus'), value: (r) => r.status, kind: 'text' })
  }

  const donutItems =
    donutTab === 'revenue'
      ? data.revenue.byFolder.map((f) => ({
          id: f.id,
          name: f.label,
          amount: f.amount,
        }))
      : data.expenseFolders.map((f) => ({
          id: f.id,
          name: translateLabel(t, f.label),
          amount: f.amount,
        }))

  return (
    <div className="space-y-6">
      <PrintHeader
        title={t('nav.summary')}
        entity={deps.entity}
        preset={deps.from && deps.to ? `${deps.from} – ${deps.to}` : deps.preset}
        asOf={data.meta.asOf}
      />
      {/* Notice: Open period / missing months */}
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

      {/* KPI Cards row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <CashBalanceCard
          asOf={data.meta.asOf}
          entityCount={data.cashPosition.entityCount || 1}
          cash={data.cashPosition.cash}
          bank={data.cashPosition.bank}
          deposit={data.cashPosition.deposit}
          inTransit={data.cashPosition.inTransit}
          giroOutstanding={data.cashPosition.giroOutstanding}
          onOpen={() => navigate({ to: '/cash-position', search: searchUpdater((prev) => prev) })}
        />

        <KpiCard
          label={t('nav.revenue')}
          value={data.revenue.total}
          compareValue={data.revenue.compare}
          compareLabel={compareLabel}
          higherIsBetter={true}
          onOpen={() => navigate({ to: '/revenue', search: searchUpdater((prev) => prev) })}
        />

        <KpiCard
          label={t('nav.pnl')}
          value={data.pnl.netProfit}
          compareLabel={
            data.pnl.netMargin ? `${t('metric.netMargin')}: ${formatPercent(data.pnl.netMargin, lang, 1)}` : undefined
          }
          higherIsBetter={true}
          onOpen={() => navigate({ to: '/profit-loss', search: searchUpdater((prev) => prev) })}
        />

        <KpiCard
          label={t('nav.payables')}
          value={data.apAging.total}
          compareValue={data.apAging.overdueBills}
          compareLabel={t('ui.summary.overdue')}
          higherIsBetter={false}
          onOpen={() => navigate({ to: '/payables', search: searchUpdater((prev) => prev) })}
        />
      </div>

      {/* Charts row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <CashflowChart
            title={t('nav.cashFlow')}
            data={data.cashFlow.monthly}
            net={data.cashFlow.netCashFlow}

            lang={lang}
            onSelectMonth={() => navigate({ to: '/cash-flow', search: searchUpdater((prev) => prev) })}
          />
        </div>

        <div className="lg:col-span-1">
          <DonutBreakdown
            title={t('ui.summary.composition')}
            tabs={[
              { id: 'revenue', label: t('metric.tabs.revenue') },
              { id: 'expense', label: t('metric.tabs.expense') },
            ]}
            activeTab={donutTab}
            onTabChange={(t) => setDonutTab(t as 'revenue' | 'expense')}
            items={donutItems}
            totalLabel={
              donutTab === 'revenue'
                ? t('ui.summary.totalRevenue')
                : t('ui.summary.totalExpense')
            }
            lang={lang}
            onSelect={() =>
              navigate({
                to: donutTab === 'revenue' ? '/revenue' : '/profit-loss',
                search: searchUpdater((prev) => prev),
              })
            }
          />
        </div>
      </div>

      {/* 7-Day Payment Plan Table */}
      <div className="w-full max-w-xl">
        <Tabs<BillScope>
          tabs={[
            { id: 'due', label: t('metric.billsTabDue', { count: bills.data?.scopes.due.count ?? 0 }) },
            { id: 'overdue', label: t('metric.billsTabOverdue', { count: bills.data?.scopes.overdue.count ?? 0 }) },
          ]}
          value={billScope}
          onChange={(id) => {
            setBillScope(id)
            table.setPage(1)
          }}
        />
      </div>
      <DataTable
        title={billScope === 'overdue' ? t('metric.billsOverdue') : t('metric.billsDue7Days')}
        columns={columns}
        data={bills.data?.rows ?? []}
        getRowId={(r) => r.invoiceId}
        sort={table.sort}
        onSortChange={table.setSort}
        pagination={bills.data ? { page: bills.data.page, pageSize: bills.data.pageSize, total: bills.data.total } : undefined}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        isFetching={bills.isFetching}
        onRowClick={() => navigate({ to: '/payment-plan', search: searchUpdater((prev) => prev) })}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              loadRows={() => exportPaymentBills({ entity: deps.entity, preset: deps.preset, from: deps.from, to: deps.to, p13: deps.p13, sortBy: table.query.sortBy, sortDir: table.query.sortDir, scope: billScope })}
              columns={exportColumns}
              filename={formatExportFilename('summary_bills_7d', deps.entity, deps.from && deps.to ? `${deps.from}_${deps.to}` : deps.preset)}
            />
            <PrintButton />
          </div>
        }
        emptyMessage={t('common.noData')}
        mobileCard={(r) => (
          <>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{r.vendorName}</div>
                <div className="text-xs font-mono text-muted">{r.invoiceNumber}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">
                  {formatMoneyFull(r.balance, lang)}
                </div>
                <div className="text-xs text-muted">
                  {formatDate(r.dueDate, lang)}
                </div>
              </div>
            </div>
            {planStatusInUse && (
              <div className="mt-1">
                <PlanStatusPill status={r.status} />
              </div>
            )}
          </>
        )}
      />

      {/* Mini metrics bar: Runway + Margins + Current Ratio */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="nr-card p-4">
          <span className="text-xs text-muted block mb-1">{t('metric.runway')}</span>
          <span className="text-lg font-bold">
            {data.runway.cashFlowPositive
              ? t('metric.runwayPositive')
              : data.runway.runwayMonths
                ? `${data.runway.runwayMonths} ${t('metric.months')}`
                : '—'}
          </span>
        </div>

        <div className="nr-card p-4">
          <span className="text-xs text-muted block mb-1">{t('metric.grossMargin')}</span>
          <span className="text-lg font-bold">
            {data.pnl.grossMargin ? formatPercent(data.pnl.grossMargin, lang, 1) : '—'}
          </span>
        </div>

        <div className="nr-card p-4">
          <span className="text-xs text-muted block mb-1">{t('metric.netMargin')}</span>
          <span className="text-lg font-bold">
            {data.pnl.netMargin ? formatPercent(data.pnl.netMargin, lang, 1) : '—'}
          </span>
        </div>

        <div className="nr-card p-4">
          <span className="text-xs text-muted block mb-1">{t('metric.currentRatio')}</span>
          <span className="text-lg font-bold">
            {data.runway.currentRatio ? `${Number(data.runway.currentRatio).toFixed(2)}x` : '—'}
          </span>
        </div>
      </div>
    </div>
  )
}
