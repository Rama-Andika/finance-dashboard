import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, AlertTriangle, Info } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Cell,
} from 'recharts'
import { chartSearchSchema, drillSearchSchema } from '~/lib/filters/search-schema'
import {
  cashFlowMetricOptions,
  expensePaidMetricOptions,
} from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { CashflowChart } from '~/components/neraca/CashflowChart'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { Tabs } from '~/components/neraca/Tabs'
import { Button } from '~/components/neraca/Button'
import { ExportCsvButton, formatExportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { PrintHeader } from '~/components/export/PrintHeader'
import { formatAxisShort, formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatMonthYear } from '~/lib/format/date'
import type { Breakdown, Lang } from '~/lib/finance/types'

export const Route = createFileRoute('/_authed/cash-flow')({
  validateSearch: chartSearchSchema.extend(drillSearchSchema.shape),
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    p13: search.p13,
    chart: search.chart,
  }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(cashFlowMetricOptions(deps)),
      context.queryClient.ensureQueryData(expensePaidMetricOptions(deps)),
    ]),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: CashFlowPage,
})

type CashFlowActivityRow = {
  id: string
  name: string
  amount: string
  isUnclassified?: boolean
  isDrawerHeader?: boolean
  drawerKey?: string
}

function CashFlowPage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data: cfData } = useQuery(cashFlowMetricOptions(deps))
  const { data: expData } = useQuery(expensePaidMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  const [activeTab, setActiveTab] = useState<'activities' | 'expensePaid'>('activities')

  if (!cfData) return null

  const handleRangeChange = (r: 'ytd' | 'last-12m') => {
    navigate({
      to: '/cash-flow',
      search: (prev: any) => ({
        ...prev,
        chart: r,
      }),
    })
  }

  // Waterfall Chart data
  const drawerMap = new Map(cfData.drawers.map((d) => [d.drawer, d.total]))
  const opAmount = Number(drawerMap.get('OPERATING') || 0)
  const invAmount = Number(drawerMap.get('INVESTING') || 0)
  const finAmount = Number(drawerMap.get('FUNDING') || 0)

  const waterfallData = [
    {
      name: t('metric.openingCash'),
      amountNum: Number(cfData.openingCash) || 0,
      rawAmount: cfData.openingCash,
      color: 'var(--chart-5)',
    },
    {
      name: t('metric.operating'),
      amountNum: opAmount,
      rawAmount: drawerMap.get('OPERATING') || '0',
      color: opAmount >= 0 ? 'var(--chart-income)' : 'var(--chart-expense)',
    },
    {
      name: t('metric.investing'),
      amountNum: invAmount,
      rawAmount: drawerMap.get('INVESTING') || '0',
      color: invAmount >= 0 ? 'var(--chart-income)' : 'var(--chart-expense)',
    },
    {
      name: t('metric.financing'),
      amountNum: finAmount,
      rawAmount: drawerMap.get('FUNDING') || '0',
      color: finAmount >= 0 ? 'var(--chart-income)' : 'var(--chart-expense)',
    },
    {
      name: t('metric.closingCash'),
      amountNum: Number(cfData.closingCash) || 0,
      rawAmount: cfData.closingCash,
      color: 'var(--chart-1)',
    },
  ]

  // Flatten drawer activities for DataTable
  const activityRows: CashFlowActivityRow[] = []
  for (const d of cfData.drawers) {
    const drawerLabel =
      d.drawer === 'OPERATING'
        ? t('metric.operating')
        : d.drawer === 'INVESTING'
          ? t('metric.investing')
          : t('metric.financing')

    activityRows.push({
      id: `drawer-${d.drawer}`,
      name: drawerLabel,
      amount: d.total,
      isDrawerHeader: true,
      drawerKey: d.drawer,
    })

    for (const r of d.rows) {
      activityRows.push({
        id: `row-${d.drawer}-${r.subGroup}`,
        name: r.subGroup,
        amount: r.amount,
        isUnclassified: r.unclassified,
        drawerKey: d.drawer,
      })
    }
  }

  const activityColumns: ColumnDef<CashFlowActivityRow, any>[] = [
    {
      accessorKey: 'name',
      header: lang === 'id' ? 'Aktivitas Arus Kas' : 'Cash Flow Activity',
      cell: ({ row }) => {
        const item = row.original
        if (item.isDrawerHeader) {
          return <span className="font-bold text-ink">{item.name}</span>
        }
        return (
          <div className="flex items-center gap-2 pl-4">
            {item.isUnclassified && (
              <span title={t('metric.unallocated')}>
                <AlertTriangle className="nr-icon nr-icon-sm text-warning" />
              </span>
            )}
            <span className={item.isUnclassified ? 'text-warning font-medium' : undefined}>
              {item.name}
            </span>
          </div>
        )
      },
    },
    {
      accessorKey: 'amount',
      header: lang === 'id' ? 'Arus Kas (Rp)' : 'Cash Flow (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue, row }) => (
        <span className={row.original.isDrawerHeader ? 'font-bold' : undefined}>
          {formatMoneyFull(getValue() as string, lang)}
        </span>
      ),
    },
  ]

  // Expense Paid columns
  const expenseColumns: ColumnDef<Breakdown, any>[] = [
    {
      accessorKey: 'label',
      header: lang === 'id' ? 'Kategori Beban' : 'Expense Category',
      cell: ({ row }) => <span className="nr-name">{row.original.label}</span>,
    },
    {
      accessorKey: 'amount',
      header: lang === 'id' ? 'Dibayarkan (Rp)' : 'Paid Amount (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
  ]

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PrintHeader
        title={t('nav.cashFlow')}
        entity={deps.entity}
        preset={deps.preset}
        asOf={cfData.meta.asOf}
      />
      {cfData.meta.hasOpenPeriod && (
        <Notice
          tone="warning"
          title={t('metric.openPeriodWarning', {
            month: formatMonthYear(cfData.meta.asOf, lang),
          })}
        />
      )}
      {cfData.meta.missingMonths.length > 0 && (
        <Notice
          tone="warning"
          title={t('metric.missingMonthsWarning')}
          body={cfData.meta.missingMonths.join(', ')}
        />
      )}

      {/* Source Classification Notice */}
      <div className="text-xs text-muted flex items-center gap-1.5">
        <Info className="nr-icon nr-icon-sm" />
        <span>
          {lang === 'id' ? 'Sumber klasifikasi:' : 'Classification source:'}{' '}
          <strong className="text-ink">
            {cfData.source === 'setup'
              ? lang === 'id'
                ? 'Tabel Cash Flow Setup'
                : 'Cash Flow Setup Table'
              : lang === 'id'
                ? 'Fallback Lawan Transaksi'
                : 'Offset Account Fallback'}
          </strong>
        </span>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={t('metric.openingCash')}
          value={cfData.openingCash}
          higherIsBetter={true}
        />
        <KpiCard
          label={t('metric.netCashFlow')}
          value={cfData.netCashFlow}
          higherIsBetter={true}
        />
        <KpiCard
          label={t('metric.closingCash')}
          value={cfData.closingCash}
          higherIsBetter={true}
        />
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Waterfall Chart */}
        <div className="nr-card space-y-4">
          <div className="nr-card-head" style={{ margin: 0 }}>
            <h3 className="nr-card-title">
              {lang === 'id' ? 'Aliran Arus Kas (Waterfall)' : 'Cash Flow Waterfall'}
            </h3>
            <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
              {formatMoneyShort(cfData.netCashFlow, lang)}
            </span>
          </div>

          <div style={{ height: 260 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={waterfallData}
                margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="var(--chart-grid)"
                />
                <XAxis
                  dataKey="name"
                  axisLine={{ stroke: 'var(--chart-axis)' }}
                  tickLine={false}
                  tick={{ fill: 'var(--ink-muted)', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
                  tickFormatter={(val) => formatAxisShort(val, lang)}
                />
                <RechartsTooltip
                  cursor={{ fill: 'var(--surface-hover)' }}
                  content={({ active, payload }) => {
                    if (active && payload && payload.length > 0) {
                      const item = payload[0]?.payload
                      return (
                        <div className="nr-tooltip">
                          <div className="font-semibold">{item.name}</div>
                          <div className="tabular-nums font-semibold mt-1">
                            {formatMoneyFull(item.rawAmount, lang)}
                          </div>
                        </div>
                      )
                    }
                    return null
                  }}
                />
                <Bar dataKey="amountNum" radius={[4, 4, 0, 0]} maxBarSize={48}>
                  {waterfallData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Dual Bar Inflow vs Outflow */}
        <CashflowChart
          title={lang === 'id' ? 'Arus Kas Bulanan' : 'Monthly Cash Flow'}
          data={cfData.monthly}
          net={cfData.netCashFlow}
          rangeLabel={deps.chart === 'last-12m' ? t('period.last12m') : t('period.ytd')}
          range={deps.chart || 'ytd'}
          onRangeChange={handleRangeChange}
          lang={lang}
        />
      </div>

      {/* Tabs */}
      <div className="w-72">
        <Tabs
          tabs={[
            { id: 'activities', label: lang === 'id' ? 'Aktivitas Arus Kas' : 'Activities' },
            { id: 'expensePaid', label: t('metric.tabs.expensePaid') },
          ]}
          value={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
        />
      </div>

      {/* Tab 1: Activities Table */}
      {activeTab === 'activities' && (
        <DataTable
          title={lang === 'id' ? 'Rincian Aktivitas' : 'Activities Breakdown'}
          columns={activityColumns}
          data={activityRows}
          getRowId={(r) => r.id}
          emptyMessage={t('common.noData')}
          headerActions={
            <div className="flex items-center gap-2">
              <ExportCsvButton
                rows={activityRows}
                columns={[
                  { header: 'Aktivitas Arus Kas', value: (r) => r.name, kind: 'text' },
                  { header: 'Jumlah (Rp)', value: (r) => r.amount, kind: 'money' },
                ]}
                filename={formatExportFilename('cash_flow_activities', deps.entity, deps.preset)}
              />
              <PrintButton />
            </div>
          }
          mobileCard={(r) => (
            <div className="flex justify-between items-center">
              <span className={r.isDrawerHeader ? 'font-bold' : undefined}>{r.name}</span>
              <span className="font-semibold tabular-nums">{formatMoneyFull(r.amount, lang)}</span>
            </div>
          )}
        />
      )}

      {/* Tab 2: Expense Paid */}
      {activeTab === 'expensePaid' && expData && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <KpiCard
              label={lang === 'id' ? 'Total Biaya Dibayar' : 'Total Expense Paid'}
              value={expData.total}
              higherIsBetter={false}
            />
            <KpiCard
              label={lang === 'id' ? 'Pelunasan Utang Vendor' : 'AP Payments'}
              value={expData.apPayments}
              higherIsBetter={false}
            />
            <KpiCard
              label={lang === 'id' ? 'Pembayaran Langsung' : 'Direct Payments'}
              value={expData.directPayments}
              higherIsBetter={false}
            />
          </div>

          <DataTable
            title={lang === 'id' ? 'Beban Dibayar per Kategori' : 'Expense Paid by Category'}
            columns={expenseColumns}
            data={expData.byCategory}
            getRowId={(r) => r.id}
            emptyMessage={t('common.noData')}
            headerActions={
              <div className="flex items-center gap-2">
                <ExportCsvButton
                  rows={expData.byCategory}
                  columns={[
                    { header: 'Kategori Beban', value: (r) => r.label, kind: 'text' },
                    { header: 'Jumlah (Rp)', value: (r) => r.amount, kind: 'money' },
                  ]}
                  filename={formatExportFilename('expense_paid', deps.entity, deps.preset)}
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
      )}
    </div>
  )
}
