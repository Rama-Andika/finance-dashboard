import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { DeltaPill } from '~/components/neraca/DeltaPill'
import { ExportCsvButton } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { formatMoneyFull } from '~/lib/format/number'
import type { Id, Lang } from '~/lib/core/types'
import type { BudgetRow } from '~/lib/finance/pnl/budget'

const isGroup = (row: BudgetRow): boolean => Boolean(row.children && row.children.length > 0)

/** Budget vs actual per account folder (expandable) with the variance; a click on a row opens its drill-down. */
export function BudgetTable({
  rows,
  lang,
  filename,
  onOpen,
}: {
  rows: BudgetRow[]
  lang: Lang
  filename: string
  onOpen: (coaId: Id, name: string) => void
}) {
  const { t } = useTranslation()

  /** An amount column; the rows that group other rows are bold. */
  const amountColumn = (key: 'budget' | 'actual' | 'variance', header: string): ColumnDef<BudgetRow, unknown> => ({
    accessorKey: key,
    header,
    meta: { align: 'right' },
    cell: ({ getValue, row }): ReactNode => (
      <span className={isGroup(row.original) ? 'font-bold' : undefined}>{formatMoneyFull(getValue() as string, lang)}</span>
    ),
  })

  const columns: ColumnDef<BudgetRow, unknown>[] = [
    {
      accessorKey: 'name',
      header: t('ui.budget.budgetItem'),
      cell: ({ row }) => (
        <span className={isGroup(row.original) ? 'font-bold text-ink' : undefined}>{row.original.name}</span>
      ),
    },
    amountColumn('budget', t('ui.budget.budgetIdr')),
    amountColumn('actual', t('ui.budget.actualIdr')),
    amountColumn('variance', t('ui.budget.varianceIdr')),
    {
      id: 'variancePercent',
      header: t('ui.col.variancePct'),
      meta: { align: 'right' },
      cell: ({ row }) => (
        <DeltaPill change={row.original.variancePercent} higherIsBetter={row.original.higherIsBetter} lang={lang} />
      ),
    },
  ]

  return (
    <DataTable
      title={t('ui.budget.budgetVsActualPerformance')}
      columns={columns}
      data={rows}
      getSubRows={(r) => r.children}
      getRowId={(r) => r.coaId}
      onRowClick={(r) => onOpen(r.coaId, r.name)}
      emptyMessage={t('common.noData')}
      headerActions={
        <div className="flex items-center gap-2">
          <ExportCsvButton
            rows={rows}
            columns={[
              { header: t('ui.col.accountCode'), value: (r) => r.code, kind: 'text' },
              { header: t('ui.col.accountCategory'), value: (r) => r.name, kind: 'text' },
              { header: t('ui.col.budget'), value: (r) => r.budget, kind: 'money' },
              { header: t('ui.col.actual'), value: (r) => r.actual, kind: 'money' },
              { header: t('ui.col.variance'), value: (r) => r.variance, kind: 'money' },
              { header: t('ui.col.variancePct'), value: (r) => (r.variancePercent ? `${r.variancePercent}%` : ''), kind: 'text' },
            ]}
            filename={filename}
          />
          <PrintButton />
        </div>
      }
      mobileCard={(r) => (
        <div className="space-y-1">
          <div className="flex justify-between items-start">
            <span className={isGroup(r) ? 'font-bold' : undefined}>{r.name}</span>
            <DeltaPill change={r.variancePercent} higherIsBetter={r.higherIsBetter} lang={lang} />
          </div>
          <div className="text-xs text-muted flex justify-between">
            <span>{t('ui.budget.budgetShort')}: {formatMoneyFull(r.budget, lang)}</span>
            <span>{t('ui.budget.actualShort')}: {formatMoneyFull(r.actual, lang)}</span>
          </div>
        </div>
      )}
    />
  )
}
