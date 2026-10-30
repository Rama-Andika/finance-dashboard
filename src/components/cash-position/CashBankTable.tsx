import { useTranslation } from 'react-i18next'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { ExportCsvButton, exportFilename, type ExportScope } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { useOpenDrill } from '~/components/drill/useOpenDrill'
import { formatMoneyFull } from '~/lib/format/number'
import type { Breakdown, Lang } from '~/lib/core/types'

/** Cash and bank balances: category, then folder, then account. Each level opens the matching drill step. */
export function CashBankTable({ rows, lang, scope }: { rows: Breakdown[]; lang: Lang; scope: ExportScope }) {
  const { t } = useTranslation()
  const openDrill = useOpenDrill()

  // Category labels come from the server in neutral form; translate cash/bank here.
  const data: Breakdown[] = rows.map((c) =>
    c.id === 'cash' || c.id === 'bank' ? { ...c, label: t(`cashCard.${c.id}`) } : c,
  )

  const categoryIds = new Set(rows.map((c) => c.id))
  const folderIds = new Set(rows.flatMap((c) => (c.children ?? []).map((f) => f.id)))
  const openRow = (r: Breakdown) => {
    const kind = categoryIds.has(r.id) ? 'section' : folderIds.has(r.id) ? 'folder' : 'account'
    openDrill('cashPosition', [{ kind, id: r.id, label: r.label }])
  }

  const columns: ColumnDef<Breakdown, unknown>[] = [
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

  return (
    <DataTable
      title={t('ui.cashPosition.cashBankBreakdown')}
      columns={columns}
      data={data}
      getRowId={(r) => r.id}
      getSubRows={(r) => r.children}
      onRowClick={openRow}
      emptyMessage={t('common.noData')}
      headerActions={
        <div className="flex items-center gap-2">
          <ExportCsvButton
            rows={data}
            columns={[
              { header: t('ui.col.categoryFolder'), value: (r) => r.label, kind: 'text' },
              { header: t('ui.col.balanceAmount'), value: (r) => r.amount, kind: 'money' },
            ]}
            filename={exportFilename('cash_position', scope)}
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
  )
}
