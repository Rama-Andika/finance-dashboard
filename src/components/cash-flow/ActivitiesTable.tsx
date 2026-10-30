import { useTranslation } from 'react-i18next'
import { AlertTriangle } from 'lucide-react'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { ExportCsvButton, exportFilename, type ExportScope } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { useOpenDrill } from '~/components/drill/useOpenDrill'
import { formatMoneyFull } from '~/lib/format/number'
import type { Lang } from '~/lib/core/types'
import type { CashFlowActivityRow } from '~/lib/finance/cash/cashflow-view'

/** Operating / investing / funding rows with their sub-rows; a click opens the matching drill-down. */
export function ActivitiesTable({ rows, lang, scope }: { rows: CashFlowActivityRow[]; lang: Lang; scope: ExportScope }) {
  const { t } = useTranslation()
  const openDrill = useOpenDrill()

  const columns: ColumnDef<CashFlowActivityRow, unknown>[] = [
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
            <span className={item.isUnclassified ? 'text-warning font-medium' : undefined}>{item.name}</span>
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

  return (
    <DataTable
      title={t('ui.cashFlow.activitiesBreakdown')}
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => {
        if (!r.drawerKey) return
        const drawerLabel = rows.find((a) => a.isDrawerHeader && a.drawerKey === r.drawerKey)?.name ?? r.drawerKey
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
            rows={rows}
            columns={[
              { header: t('ui.col.cashFlowActivity'), value: (r) => r.name, kind: 'text' },
              { header: t('ui.col.amount'), value: (r) => r.amount, kind: 'money' },
            ]}
            filename={exportFilename('cash_flow_activities', scope)}
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
  )
}
