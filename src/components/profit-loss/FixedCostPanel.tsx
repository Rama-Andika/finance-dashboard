import { useTranslation } from 'react-i18next'
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
import { translateLabel } from '~/lib/core/i18n-label'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { ExportCsvButton, exportFilename, type ExportScope } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { useOpenDrill } from '~/components/drill/useOpenDrill'
import { formatAxisShort, formatMoneyFull, formatMoneyShort } from '~/lib/format/number'
import { formatMonth, formatMonthYear } from '~/lib/format/date'
import type { Breakdown, Lang, Money } from '~/lib/core/types'

/** The part of the fixed-cost metric this panel draws. */
export type FixedCostPanelData = {
  months: Array<{ month: string; fixed: Money; variable: Money }>
  averageFixed: Money
  byFolder: Breakdown[]
}

const CHART_HEIGHT = 260

/** Fixed versus variable cost per month, and the fixed-cost folder table below it. */
export function FixedCostPanel({ data, lang, scope }: { data: FixedCostPanelData; lang: Lang; scope: ExportScope }) {
  const { t } = useTranslation()
  const openDrill = useOpenDrill()

  const chartData = data.months.map((m) => ({
    month: m.month,
    displayMonth: formatMonth(m.month, lang),
    fixedNum: Number(m.fixed) || 0,
    variableNum: Number(m.variable) || 0,
    rawFixed: m.fixed,
    rawVariable: m.variable,
  }))
  const avgFixedNum = Number(data.averageFixed || 0)

  const columns: ColumnDef<Breakdown, unknown>[] = [
    {
      accessorKey: 'label',
      header: t('ui.profitLoss.fixedCostFolder'),
      cell: ({ row }) => <span className="nr-name">{translateLabel(t, row.original.label)}</span>,
    },
    {
      accessorKey: 'amount',
      header: t('ui.profitLoss.amountIdr'),
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
  ]

  return (
    <div className="space-y-6">
      <div className="nr-card space-y-4">
        <div className="nr-card-head" style={{ margin: 0 }}>
          <h3 className="nr-card-title">{t('ui.profitLoss.fixedVsVariableCosts')}</h3>
          <span className="nr-muted nr-num" style={{ fontSize: 13 }}>
            {t('ui.profitLoss.averageFixed')} {formatMoneyShort(data.averageFixed, lang)}
          </span>
        </div>

        <div style={{ height: CHART_HEIGHT }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--chart-grid)" />
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
                  if (!active || !payload || payload.length === 0) return null
                  const item = payload[0]?.payload
                  return (
                    <div className="nr-tooltip">
                      <div className="font-semibold">{formatMonthYear(item.month, lang)}</div>
                      <div className="text-xs text-muted mt-1">
                        {t('ui.profitLoss.fixedLabel')}: {formatMoneyFull(item.rawFixed, lang)}
                      </div>
                      <div className="text-xs text-muted">
                        {t('ui.profitLoss.variableLabel')}: {formatMoneyFull(item.rawVariable, lang)}
                      </div>
                    </div>
                  )
                }}
              />
              {avgFixedNum > 0 && (
                <ReferenceLine
                  y={avgFixedNum}
                  stroke="var(--warning)"
                  strokeDasharray="4 4"
                  label={{ value: t('ui.profitLoss.averageFixedShort'), fill: 'var(--warning)', fontSize: 10, position: 'top' }}
                />
              )}
              <Bar dataKey="fixedNum" stackId="cost" fill="var(--chart-3)" radius={[0, 0, 0, 0]} maxBarSize={48} />
              <Bar dataKey="variableNum" stackId="cost" fill="var(--chart-4)" radius={[4, 4, 0, 0]} maxBarSize={48} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <DataTable
        title={t('ui.profitLoss.fixedCostFolders')}
        columns={columns}
        data={data.byFolder}
        getRowId={(r) => r.id}
        getSubRows={(r) => r.children}
        onRowClick={(r) => openDrill('fixedCost', [{ kind: 'folder', id: r.id, label: translateLabel(t, r.label) }])}
        emptyMessage={t('common.noData')}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={data.byFolder}
              columns={[
                { header: t('ui.col.fixedCostFolder'), value: (r) => translateLabel(t, r.label), kind: 'text' },
                { header: t('ui.col.amount'), value: (r) => r.amount, kind: 'money' },
              ]}
              filename={exportFilename('fixed_cost', scope)}
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
  )
}
