import { searchUpdater } from '~/lib/filters/search-update'
import { translateCfLabel } from '~/lib/finance/cashflow-labels'
import { useState } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useOpenDrill } from '~/components/drill/useOpenDrill'
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
    from: search.from,
    to: search.to,
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
  /** Server sub-group value, used as the drill-down id. */
  subGroupId?: string
  isDrawerHeader?: boolean
  drawerKey?: string
}

function CashFlowPage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data: cfData } = useQuery(cashFlowMetricOptions(deps))
  const { data: expDataRaw } = useQuery(expensePaidMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  const [activeTab, setActiveTab] = useState<'activities' | 'expensePaid'>('activities')
  const openDrill = useOpenDrill()

  if (!cfData) return null

  // Server labels are language-neutral; translate the fixed categories and unknown vendors here.
  const localizeExpense = (b: Breakdown): Breakdown => ({
    ...b,
    label:
      b.id === 'apBills' || b.id === 'unallocated'
        ? t(`ui.col.${b.id}`)
        : b.label || t('ui.col.unknownVendor'),
    children: b.children?.map(localizeExpense),
  })
  const expData = expDataRaw ? { ...expDataRaw, byCategory: expDataRaw.byCategory.map(localizeExpense) } : undefined

  const handleRangeChange = (r: 'ytd' | 'last-12m') => {
    navigate({
      to: '/cash-flow',
      resetScroll: false,
      search: searchUpdater((prev) => ({
        ...prev,
        chart: r,
      })),
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
        name: r.unclassified ? t('ui.col.unclassified') : translateCfLabel(t, r.subGroup),
        subGroupId: r.subGroup,
        amount: r.amount,
        isUnclassified: r.unclassified,
        drawerKey: d.drawer,
      })
    }
  }

  const activityColumns: ColumnDef<CashFlowActivityRow, any>[] = [
    {
      accessorKey: 'name',
      header: t('ui.cashFlow.cashFlowActivity'),
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
      header: t('ui.cashFlow.cashFlowIdr'),
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
      header: t('ui.cashFlow.expenseCategory'),
      cell: ({ row }) => <span className="nr-name">{row.original.label}</span>,
    },
    {
      accessorKey: 'amount',
      header: t('ui.cashFlow.paidAmountIdr'),
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
  ]

  return (
    <div className="space-y-6">
      <PrintHeader
        title={t('nav.cashFlow')}
        entity={deps.entity}
        preset={deps.from && deps.to ? `${deps.from} – ${deps.to}` : deps.preset}
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
          {t('ui.cashFlow.classificationSource')}{' '}
          <strong className="text-ink">
            {cfData.source === 'setup'
              ? t('ui.cashFlow.cashFlowSetupTable')
              : t('ui.cashFlow.offsetAccountFallback')}
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
              {t('ui.cashFlow.cashFlowWaterfall')}
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
          title={t('ui.cashFlow.monthlyCashFlow')}
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
            { id: 'activities', label: t('ui.cashFlow.activities') },
            { id: 'expensePaid', label: t('metric.tabs.expensePaid') },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />
      </div>

      {/* Tab 1: Activities Table */}
      {activeTab === 'activities' && (
        <DataTable
          title={t('ui.cashFlow.activitiesBreakdown')}
          columns={activityColumns}
          data={activityRows}
          getRowId={(r) => r.id}
          onRowClick={(r) => {
            if (!r.drawerKey) return
            const drawerLabel = activityRows.find((a) => a.isDrawerHeader && a.drawerKey === r.drawerKey)?.name ?? r.drawerKey
            const drawerStep = { kind: 'section' as const, id: r.drawerKey, label: drawerLabel }
            openDrill(
              'cashFlow',
              r.isDrawerHeader ? [drawerStep] : [drawerStep, { kind: 'subrow' as const, id: r.subGroupId ?? r.name, label: r.name }],
            )
          }}
          emptyMessage={t('common.noData')}
          headerActions={
            <div className="flex items-center gap-2">
              <ExportCsvButton
                rows={activityRows}
                columns={[
                  { header: t('ui.col.cashFlowActivity'), value: (r) => r.name, kind: 'text' },
                  { header: t('ui.col.amount'), value: (r) => r.amount, kind: 'money' },
                ]}
                filename={formatExportFilename('cash_flow_activities', deps.entity, deps.from && deps.to ? `${deps.from}_${deps.to}` : deps.preset)}
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
              label={t('ui.cashFlow.totalExpensePaid')}
              value={expData.total}
              higherIsBetter={false}
            />
            <KpiCard
              label={t('ui.cashFlow.apPayments')}
              value={expData.apPayments}
              higherIsBetter={false}
            />
            <KpiCard
              label={t('ui.cashFlow.directPayments')}
              value={expData.directPayments}
              higherIsBetter={false}
            />
          </div>

          <DataTable
            title={t('ui.cashFlow.expensePaidByCategory')}
            columns={expenseColumns}
            data={expData.byCategory}
            getRowId={(r) => r.id}
            getSubRows={(r) => r.children}
            onRowClick={(r) => {
              const isCategory = expData.byCategory.some((c) => c.id === r.id)
              const parent = expData.byCategory.find((c) => (c.children ?? []).some((ch) => ch.id === r.id))
              if (isCategory) {
                openDrill('expensePaid', [{ kind: r.id === 'apBills' || r.id === 'unallocated' ? 'section' : 'folder', id: r.id, label: r.label }])
              } else if (parent) {
                const parentKind = parent.id === 'apBills' || parent.id === 'unallocated' ? 'section' : 'folder'
                const childKind = parentKind === 'section' ? 'vendor' : 'account'
                openDrill('expensePaid', [
                  { kind: parentKind, id: parent.id, label: parent.label },
                  { kind: childKind, id: r.id, label: r.label },
                ])
              }
            }}
            emptyMessage={t('common.noData')}
            headerActions={
              <div className="flex items-center gap-2">
                <ExportCsvButton
                  rows={expData.byCategory}
                  columns={[
                    { header: t('ui.col.expenseCategory'), value: (r) => r.label, kind: 'text' },
                    { header: t('ui.col.amount'), value: (r) => r.amount, kind: 'money' },
                  ]}
                  filename={formatExportFilename('expense_paid', deps.entity, deps.from && deps.to ? `${deps.from}_${deps.to}` : deps.preset)}
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
