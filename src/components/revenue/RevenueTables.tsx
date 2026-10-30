import { useTranslation } from 'react-i18next'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { ExportCsvButton } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { D } from '~/lib/core/money'
import { buildEntityTableRows, type EntityTableRow } from '~/lib/finance/pnl/revenue-entity'
import { formatMoneyFull, formatPercent } from '~/lib/format/number'
import type { Breakdown, Id, Lang, Money } from '~/lib/core/types'

/** Revenue per account folder; a click on a row opens its drill-down. */
export function RevenueFolderTable({
  rows,
  lang,
  filename,
  onSelect,
}: {
  rows: Breakdown[]
  lang: Lang
  filename: string
  onSelect: (folderId: Id, folderLabel: string) => void
}) {
  const { t } = useTranslation()

  const columns: ColumnDef<Breakdown, unknown>[] = [
    {
      accessorKey: 'label',
      header: t('ui.revenue.categoryFolder'),
      cell: ({ row }) => <span className="nr-name">{row.original.label}</span>,
    },
    {
      accessorKey: 'amount',
      header: t('ui.revenue.totalIdr'),
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
  ]

  return (
    <DataTable
      title={t('ui.revenue.revenueByFolder')}
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      onRowClick={(r) => onSelect(r.id, r.label)}
      emptyMessage={t('common.noData')}
      headerActions={
        <div className="flex items-center gap-2">
          <ExportCsvButton
            rows={rows}
            columns={[
              { header: t('ui.col.categoryFolder'), value: (r) => r.label, kind: 'text' },
              { header: t('ui.col.total'), value: (r) => r.amount, kind: 'money' },
            ]}
            filename={filename}
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

/** Revenue per entity with its share, plus a last row for revenue that belongs to no entity. */
export function RevenueEntityTable({
  entities,
  unassigned,
  lang,
  filename,
}: {
  entities: Array<{ id: Id; name: string; amount: Money }>
  unassigned: Money
  lang: Lang
  filename: string
}) {
  const { t } = useTranslation()
  const rows = buildEntityTableRows(entities, unassigned, t('ui.revenue.noEntity'))

  const columns: ColumnDef<EntityTableRow, unknown>[] = [
    {
      accessorKey: 'name',
      header: t('ui.revenue.entity'),
      cell: ({ row }) => <span className="nr-name">{row.original.name}</span>,
    },
    {
      accessorKey: 'amount',
      header: t('ui.revenue.totalIdr'),
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      accessorKey: 'share',
      header: t('ui.revenue.share'),
      meta: { align: 'right' },
      cell: ({ row }) => formatPercent(row.original.share, lang, 1),
    },
  ]

  return (
    <DataTable
      title={t('ui.revenue.revenueByEntity')}
      columns={columns}
      data={rows}
      getRowId={(r) => r.id}
      emptyMessage={t('common.noData')}
      headerActions={
        <ExportCsvButton
          rows={rows}
          columns={[
            { header: t('ui.col.entity'), value: (r) => r.name, kind: 'text' },
            { header: t('ui.col.total'), value: (r) => r.amount, kind: 'money' },
            {
              header: t('ui.col.share'),
              value: (r) => (r.share === null ? null : D(r.share).times(100).toFixed(2)),
              kind: 'number',
            },
          ]}
          filename={filename}
        />
      }
      mobileCard={(r) => (
        <div className="flex justify-between items-center gap-3">
          <span className="font-semibold">{r.name}</span>
          <span className="tabular-nums">
            <span className="font-semibold">{formatMoneyFull(r.amount, lang)}</span>
            <span className="nr-muted"> · {formatPercent(r.share, lang, 1)}</span>
          </span>
        </div>
      )}
    />
  )
}
