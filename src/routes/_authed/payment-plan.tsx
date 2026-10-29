import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { Download } from 'lucide-react'
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ReferenceLine,
} from 'recharts'
import {
  paymentPlanSearchSchema,
  drillSearchSchema,
  type Horizon,
} from '~/lib/filters/search-schema'
import { paymentPlanMetricOptions } from '~/queries/metrics.queries'
import { MetricSkeleton } from '~/components/neraca/MetricSkeleton'
import { MetricError } from '~/components/neraca/MetricError'
import { Notice } from '~/components/neraca/Notice'
import { KpiCard } from '~/components/neraca/KpiCard'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { StatusPill } from '~/components/neraca/StatusPill'
import { Button } from '~/components/neraca/Button'
import { ExportCsvButton, formatExportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { PrintHeader } from '~/components/export/PrintHeader'
import { formatAxisShort, formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatDate, formatMonthYear } from '~/lib/format/date'
import { D, sum } from '~/lib/finance/money'
import type { Lang } from '~/lib/finance/types'
import type { PaymentPlanDay } from '~/lib/finance/payment-plan'

export const Route = createFileRoute('/_authed/payment-plan')({
  validateSearch: paymentPlanSearchSchema.extend(drillSearchSchema.shape),
  loaderDeps: ({ search }) => ({
    entity: search.entity,
    preset: search.preset,
    p13: search.p13,
    horizon: search.horizon,
    inflow: search.inflow,
  }),
  loader: ({ context, deps }) =>
    context.queryClient.ensureQueryData(paymentPlanMetricOptions(deps)),
  pendingComponent: MetricSkeleton,
  errorComponent: MetricError,
  component: PaymentPlanPage,
})

function PaymentPlanPage() {
  const deps = Route.useLoaderDeps()
  const navigate = useNavigate()
  const { data } = useQuery(paymentPlanMetricOptions(deps))
  const { t, i18n } = useTranslation()
  const lang = (i18n.language?.startsWith('en') ? 'en' : 'id') as Lang

  if (!data) return null

  const handleHorizonChange = (h: Horizon) => {
    navigate({
      to: '/payment-plan',
      search: (prev: any) => ({
        ...prev,
        horizon: h,
      }),
    })
  }

  const handleToggleInflow = () => {
    navigate({
      to: '/payment-plan',
      search: (prev: any) => ({
        ...prev,
        inflow: !deps.inflow,
      }),
    })
  }

  const handleSelectDay = (date: string) => {
    navigate({
      to: '/payment-plan',
      search: (prev: any) => ({
        ...prev,
        drill: {
          metric: 'paymentPlan',
          steps: [{ kind: 'day', id: date, label: date }],
        },
      }),
    })
  }

  // Calculate KPIs
  const totalOutflow = sum([
    data.overdue,
    ...data.days.map((d) => d.outflow),
  ])

  let minClosing = data.openingBalance
  for (const d of data.days) {
    if (D(d.closing).lt(D(minClosing))) {
      minClosing = d.closing
    }
  }

  // Projection Line Chart data
  const chartData = data.days.map((d) => ({
    date: d.date,
    displayDate: formatDate(d.date, lang),
    closingNum: Number(d.closing) || 0,
    rawClosing: d.closing,
    isNegative: d.isNegative,
  }))

  const columns: ColumnDef<PaymentPlanDay, any>[] = [
    {
      accessorKey: 'date',
      header: lang === 'id' ? 'Tanggal' : 'Date',
      cell: ({ getValue }) => <span className="nr-name">{formatDate(getValue() as string, lang)}</span>,
    },
    {
      accessorKey: 'opening',
      header: lang === 'id' ? 'Saldo Awal (Rp)' : 'Opening (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      accessorKey: 'inflow',
      header: lang === 'id' ? 'Masuk (Rp)' : 'Inflow (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      accessorKey: 'outflow',
      header: lang === 'id' ? 'Keluar (Rp)' : 'Outflow (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      accessorKey: 'closing',
      header: lang === 'id' ? 'Saldo Akhir (Rp)' : 'Closing (IDR)',
      meta: { align: 'right' },
      cell: ({ getValue, row }) => (
        <span className={row.original.isNegative ? 'text-danger font-semibold' : undefined}>
          {formatMoneyFull(getValue() as string, lang)}
        </span>
      ),
    },
    {
      id: 'status',
      header: 'Status',
      cell: ({ row }) => {
        if (row.original.isNegative) {
          return <StatusPill tone="danger">{t('metric.minusBalance')}</StatusPill>
        }
        return <StatusPill tone="neutral">Aman</StatusPill>
      },
    },
  ]

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PrintHeader
        title={t('nav.paymentPlan')}
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

      {/* Controls row: Horizon Select & Inflows Toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted font-medium">
            {lang === 'id' ? 'Horizon:' : 'Horizon:'}
          </span>
          <div className="nr-tabs" role="tablist">
            {(['7', '14', '30'] as Horizon[]).map((h) => (
              <button
                key={h}
                type="button"
                className="nr-tab"
                role="tab"
                aria-selected={deps.horizon === h}
                onClick={() => handleHorizonChange(h)}
              >
                {h} {lang === 'id' ? 'Hari' : 'Days'}
              </button>
            ))}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant={deps.inflow ? 'primary' : 'secondary'}
            onClick={handleToggleInflow}
          >
            {t('metric.includeInflows')}
          </Button>
        </div>
      </div>

      {/* Overdue Alert if positive */}
      {Number(data.overdue) > 0 && (
        <Notice
          tone="warning"
          title={
            lang === 'id'
              ? `Ada tagihan lewat jatuh tempo sebesar ${formatMoneyShort(data.overdue, lang)}.`
              : `There is ${formatMoneyShort(data.overdue, lang)} in overdue bills.`
          }
        />
      )}

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard
          label={lang === 'id' ? 'Saldo Kas Awal' : 'Opening Cash'}
          value={data.openingBalance}
          higherIsBetter={true}
        />
        <KpiCard
          label={lang === 'id' ? 'Total Rencana Keluar' : 'Total Planned Outflows'}
          value={totalOutflow}
          higherIsBetter={false}
        />
        <KpiCard
          label={lang === 'id' ? 'Saldo Akhir Terendah' : 'Lowest Projected Balance'}
          value={minClosing}
          higherIsBetter={true}
        />
      </div>

      {/* Projected Balance Line Chart */}
      <div className="nr-card space-y-4">
        <div className="nr-card-head" style={{ margin: 0 }}>
          <h3 className="nr-card-title">
            {lang === 'id' ? 'Proyeksi Saldo Kas Harian' : 'Daily Projected Cash Balance'}
          </h3>
          <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
            {deps.horizon} {lang === 'id' ? 'hari ke depan' : 'days projection'}
          </span>
        </div>

        <div style={{ height: 260 }}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart
              data={chartData}
              margin={{ top: 10, right: 10, left: 10, bottom: 20 }}
            >
              <CartesianGrid
                strokeDasharray="3 3"
                vertical={false}
                stroke="var(--chart-grid)"
              />
              <XAxis
                dataKey="displayDate"
                axisLine={{ stroke: 'var(--chart-axis)' }}
                tickLine={false}
                tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--ink-muted)', fontSize: 11 }}
                tickFormatter={(val) => formatAxisShort(val, lang)}
              />
              <RechartsTooltip
                content={({ active, payload }) => {
                  if (active && payload && payload.length > 0) {
                    const item = payload[0]?.payload
                    return (
                      <div className="nr-tooltip">
                        <div className="font-semibold">{item.displayDate}</div>
                        <div
                          className={`tabular-nums font-semibold mt-1 ${item.isNegative ? 'text-danger' : ''}`}
                        >
                          {formatMoneyFull(item.rawClosing, lang)}
                        </div>
                        {item.isNegative && (
                          <div className="text-xs text-danger mt-0.5">Saldo minus</div>
                        )}
                      </div>
                    )
                  }
                  return null
                }}
              />
              <ReferenceLine y={0} stroke="var(--danger)" strokeDasharray="3 3" />
              <Line
                type="monotone"
                dataKey="closingNum"
                stroke="var(--chart-forest)"
                strokeWidth={2.5}
                dot={{ r: 4, fill: 'var(--chart-forest)' }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Daily Calendar Table */}
      <DataTable
        title={lang === 'id' ? 'Jadwal Rencana Bayar Harian' : 'Daily Payment Schedule'}
        columns={columns}
        data={data.days}
        getRowId={(r) => r.date}
        onRowClick={(r) => handleSelectDay(r.date)}
        emptyMessage={t('common.noData')}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={data.days}
              columns={[
                { header: 'Tanggal', value: (r) => r.date, kind: 'date' },
                { header: 'Penerimaan (Rp)', value: (r) => r.inflow, kind: 'money' },
                { header: 'Pengeluaran (Rp)', value: (r) => r.outflow, kind: 'money' },
                { header: 'Saldo Akhir (Rp)', value: (r) => r.closing, kind: 'money' },
              ]}
              filename={formatExportFilename('payment_plan', deps.entity, deps.preset)}
            />
            <PrintButton />
          </div>
        }
        mobileCard={(r) => (
          <div className="space-y-1">
            <div className="flex justify-between items-start">
              <span className="font-semibold">{formatDate(r.date, lang)}</span>
              <span className={`tabular-nums font-semibold ${r.isNegative ? 'text-danger' : ''}`}>
                {formatMoneyFull(r.closing, lang)}
              </span>
            </div>
            <div className="text-xs text-muted flex justify-between">
              <span>Masuk: {formatMoneyFull(r.inflow, lang)}</span>
              <span>Keluar: {formatMoneyFull(r.outflow, lang)}</span>
            </div>
          </div>
        )}
      />
    </div>
  )
}
