import { useState } from 'react'
import { createFileRoute } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download, Info } from 'lucide-react'
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts'
import { drillSearchSchema } from '~/lib/filters/search-schema'
import {
  pnlMetricOptions,
  fixedCostMetricOptions,
  runwayMetricOptions,
} from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { Tabs } from '~/components/neraca/Tabs'
import { Button } from '~/components/neraca/Button'
import { ExportCsvButton, formatExportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { PrintHeader } from '~/components/export/PrintHeader'
import { formatAxisShort, formatMoneyFull, formatMoneyShort, formatPercent } from '~/lib/format/number'
import { formatMonth, formatMonthYear, getCompareLabel } from '~/lib/format/date'
import type { Breakdown, Lang } from '~/lib/finance/types'
import type { PnlLine, PnlLineKey } from '~/lib/finance/pnl'

export const Route = createFileRoute('/_authed/profit-loss')({
  validateSearch: drillSearchSchema,
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    p13: search.p13,
  }),
  loader: ({ context, deps }) =>
    Promise.all([
      context.queryClient.ensureQueryData(pnlMetricOptions(deps)),
      context.queryClient.ensureQueryData(fixedCostMetricOptions(deps)),
      context.queryClient.ensureQueryData(runwayMetricOptions(deps)),
    ]),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: ProfitLossPage,
})

const PNL_LINE_LABELS: Record<PnlLineKey, { id: string; en: string }> = {
  revenue: { id: 'Pendapatan', en: 'Revenue' },
  cogs: { id: 'Beban Pokok Penjualan', en: 'Cost of Goods Sold' },
  grossProfit: { id: 'Laba Kotor', en: 'Gross Profit' },
  opex: { id: 'Beban Operasional', en: 'Operating Expenses' },
  operatingProfit: { id: 'Laba Usaha', en: 'Operating Profit' },
  otherRevenue: { id: 'Pendapatan Lain', en: 'Other Income' },
  otherExpense: { id: 'Beban Lain', en: 'Other Expense' },
  netProfit: { id: 'Laba Bersih', en: 'Net Profit' },
  oci: { id: 'Pendapatan Komprehensif Lain (OCI)', en: 'Other Comprehensive Income (OCI)' },
  comprehensiveIncome: { id: 'Total Laba Komprehensif', en: 'Comprehensive Income' },
}

const SUBTOTAL_KEYS = new Set<PnlLineKey>([
  'grossProfit',
  'operatingProfit',
  'netProfit',
  'comprehensiveIncome',
])

function ProfitLossPage() {
  const deps = Route.useLoaderDeps()
  const { data: pnlData } = useQuery(pnlMetricOptions(deps))
  const { data: fixedData } = useQuery(fixedCostMetricOptions(deps))
  const { data: runwayData } = useQuery(runwayMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  const [activeTab, setActiveTab] = useState<'pnl' | 'fixedCost'>('pnl')

  if (!pnlData) return null

  const compareLabel = getCompareLabel(deps.preset, lang)

  // Map PnL lines for KPIs
  const lineMap = new Map(pnlData.lines.map((l) => [l.key, l]))
  const revLine = lineMap.get('revenue')
  const gpLine = lineMap.get('grossProfit')
  const npLine = lineMap.get('netProfit')

  // Fixed Cost Chart Data
  const fixedCostChartData = fixedData?.months.map((m) => ({
    month: m.month,
    displayMonth: formatMonth(m.month, lang),
    fixedNum: Number(m.fixed) || 0,
    variableNum: Number(m.variable) || 0,
    rawFixed: m.fixed,
    rawVariable: m.variable,
  }))

  const avgFixedNum = Number(fixedData?.averageFixed || 0)

  // PnL Table Columns
  const pnlColumns: ColumnDef<PnlLine, any>[] = [
    {
      accessorKey: 'key',
      header: lang === 'id' ? 'Pos Laba Rugi' : 'P&L Line',
      cell: ({ row }) => {
        const item = row.original
        const isOperating = item.key === 'operatingProfit'
        const isSubtotal = SUBTOTAL_KEYS.has(item.key)
        const label = PNL_LINE_LABELS[item.key]?.[lang] || item.key
        return (
          <div className="flex items-center gap-1.5">
            <span className={isSubtotal ? 'font-bold text-ink' : undefined}>
              {label}
            </span>
            {isOperating && (
              <span
                className="text-xs text-muted inline-flex items-center cursor-help"
                title={
                  lang === 'id'
                    ? 'Belum dikurangi depresiasi'
                    : 'Before depreciation deduction'
                }
              >
                <Info className="nr-icon nr-icon-sm" />
              </span>
            )}
          </div>
        )
      },
    },
    {
      accessorKey: 'margin',
      header: 'Margin %',
      meta: { align: 'right' },
      cell: ({ getValue, row }) => {
        const val = getValue() as string | null
        const isSubtotal = SUBTOTAL_KEYS.has(row.original.key)
        if (!val) return '—'
        return (
          <span className={isSubtotal ? 'font-semibold' : 'text-muted'}>
            {formatPercent(val, lang)}
          </span>
        )
      },
    },
    {
      accessorKey: 'amount',
      header: lang === 'id' ? 'Total (Rp)' : 'Total (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue, row }) => {
        const isSubtotal = SUBTOTAL_KEYS.has(row.original.key)
        return (
          <span className={isSubtotal ? 'font-bold' : undefined}>
            {formatMoneyFull(getValue() as string, lang)}
          </span>
        )
      },
    },
  ]

  // Fixed Cost Folder Columns
  const fixedColumns: ColumnDef<Breakdown, any>[] = [
    {
      accessorKey: 'label',
      header: lang === 'id' ? 'Folder Biaya Tetap' : 'Fixed Cost Folder',
      cell: ({ row }) => <span className="nr-name">{row.original.label}</span>,
    },
    {
      accessorKey: 'amount',
      header: lang === 'id' ? 'Jumlah (Rp)' : 'Amount (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
  ]

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PrintHeader
        title={t('nav.profitLoss')}
        entity={deps.entity}
        preset={deps.preset}
        asOf={pnlData.meta.asOf}
      />
      {pnlData.meta.hasOpenPeriod && (
        <Notice
          tone="warning"
          title={t('metric.openPeriodWarning', {
            month: formatMonthYear(pnlData.meta.asOf, lang),
          })}
        />
      )}
      {pnlData.meta.missingMonths.length > 0 && (
        <Notice
          tone="warning"
          title={t('metric.missingMonthsWarning')}
          body={pnlData.meta.missingMonths.join(', ')}
        />
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={lang === 'id' ? 'Pendapatan' : 'Revenue'}
          value={revLine?.amount || '0'}
          compareLabel={compareLabel}
          higherIsBetter={true}
        />
        <KpiCard
          label={lang === 'id' ? 'Laba Kotor' : 'Gross Profit'}
          value={gpLine?.amount || '0'}
          compareLabel={
            gpLine?.margin ? `Margin: ${formatPercent(gpLine.margin, lang)}` : undefined
          }
          higherIsBetter={true}
        />
        <KpiCard
          label={lang === 'id' ? 'Laba Bersih' : 'Net Profit'}
          value={npLine?.amount || '0'}
          compareLabel={
            npLine?.margin ? `Margin: ${formatPercent(npLine.margin, lang)}` : undefined
          }
          higherIsBetter={true}
        />
      </div>

      {/* Tabs */}
      <div className="w-72">
        <Tabs
          tabs={[
            { id: 'pnl', label: lang === 'id' ? 'Laba Rugi' : 'P&L Statement' },
            { id: 'fixedCost', label: t('metric.tabs.fixedCost') },
          ]}
          value={activeTab}
          onChange={(tab) => setActiveTab(tab as any)}
        />
      </div>

      {/* Tab 1: PnL Statement Table */}
      {activeTab === 'pnl' && (
        <DataTable
          title={lang === 'id' ? 'Laporan Laba Rugi' : 'Profit & Loss Statement'}
          columns={pnlColumns}
          data={pnlData.lines}
          getRowId={(r) => r.key}
          emptyMessage={t('common.noData')}
          headerActions={
            <div className="flex items-center gap-2">
              <ExportCsvButton
                rows={pnlData.lines}
                columns={[
                  {
                    header: 'Baris Laba Rugi',
                    value: (r) => PNL_LINE_LABELS[r.key]?.[lang] || r.key,
                    kind: 'text',
                  },
                  { header: 'Jumlah (Rp)', value: (r) => r.amount, kind: 'money' },
                  { header: 'Margin (%)', value: (r) => (r.margin ? `${r.margin}%` : ''), kind: 'text' },
                ]}
                filename={formatExportFilename('profit_loss', deps.entity, deps.preset)}
              />
              <PrintButton />
            </div>
          }
          mobileCard={(r) => {
            const isSubtotal = SUBTOTAL_KEYS.has(r.key)
            const label = PNL_LINE_LABELS[r.key]?.[lang] || r.key
            return (
              <div className="flex justify-between items-center">
                <div>
                  <span className={isSubtotal ? 'font-bold' : undefined}>{label}</span>
                  {r.margin && (
                    <span className="text-xs text-muted block">Margin: {formatPercent(r.margin, lang)}</span>
                  )}
                </div>
                <span className={`tabular-nums ${isSubtotal ? 'font-bold' : ''}`}>
                  {formatMoneyFull(r.amount, lang)}
                </span>
              </div>
            )
          }}
        />
      )}

      {/* Tab 2: Fixed Cost (Biaya Tetap) */}
      {activeTab === 'fixedCost' && fixedData && (
        <div className="space-y-6">
          {/* Stacked Bar Chart: Fixed vs Variable */}
          <div className="nr-card space-y-4">
            <div className="nr-card-head" style={{ margin: 0 }}>
              <h3 className="nr-card-title">
                {lang === 'id' ? 'Biaya Tetap vs Variabel' : 'Fixed vs Variable Costs'}
              </h3>
              <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
                {lang === 'id' ? 'Rata-rata tetap:' : 'Average fixed:'}{' '}
                {formatMoneyShort(fixedData.averageFixed, lang)}
              </span>
            </div>

            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={fixedCostChartData}
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
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'var(--surface-hover)' }}
                    content={({ active, payload }) => {
                      if (active && payload && payload.length > 0) {
                        const item = payload[0]?.payload
                        return (
                          <div className="nr-tooltip">
                            <div className="font-semibold">{formatMonthYear(item.month, lang)}</div>
                            <div className="text-xs text-muted mt-1">
                              Tetap: {formatMoneyFull(item.rawFixed, lang)}
                            </div>
                            <div className="text-xs text-muted">
                              Variabel: {formatMoneyFull(item.rawVariable, lang)}
                            </div>
                          </div>
                        )
                      }
                      return null
                    }}
                  />
                  {avgFixedNum > 0 && (
                    <ReferenceLine
                      y={avgFixedNum}
                      stroke="var(--warning)"
                      strokeDasharray="4 4"
                      label={{
                        value: 'Avg Fixed',
                        fill: 'var(--warning)',
                        fontSize: 10,
                        position: 'top',
                      }}
                    />
                  )}
                  <Bar
                    dataKey="fixedNum"
                    stackId="cost"
                    fill="var(--chart-3)"
                    radius={[0, 0, 0, 0]}
                    maxBarSize={48}
                  />
                  <Bar
                    dataKey="variableNum"
                    stackId="cost"
                    fill="var(--chart-4)"
                    radius={[4, 4, 0, 0]}
                    maxBarSize={48}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Folder table */}
          <DataTable
            title={lang === 'id' ? 'Folder Biaya Tetap' : 'Fixed Cost Folders'}
            columns={fixedColumns}
            data={fixedData.byFolder}
            getRowId={(r) => r.id}
            emptyMessage={t('common.noData')}
            headerActions={
              <div className="flex items-center gap-2">
                <ExportCsvButton
                  rows={fixedData.byFolder}
                  columns={[
                    { header: 'Folder Biaya Tetap', value: (r) => r.label, kind: 'text' },
                    { header: 'Jumlah (Rp)', value: (r) => r.amount, kind: 'money' },
                  ]}
                  filename={formatExportFilename('fixed_cost', deps.entity, deps.preset)}
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
