import { useTranslation } from 'react-i18next'
import { AlertCircle } from 'lucide-react'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { formatMoneyFull } from '~/lib/format/number'
import type { Lang, Money } from '~/lib/core/types'

export type EntityBalance = { code: string; name: string; amount: Money; isNegative: boolean }

/** Cash and bank balance per entity; a negative balance is flagged. */
export function EntityBalanceTable({ rows, lang }: { rows: EntityBalance[]; lang: Lang }) {
  const { t } = useTranslation()

  const columns: ColumnDef<EntityBalance, unknown>[] = [
    {
      accessorKey: 'name',
      header: t('ui.cashPosition.entity'),
      cell: ({ row }) => (
        <div className="flex items-center gap-2">
          <span className="nr-name">{row.original.name}</span>
          <span className="nr-sub">{row.original.code}</span>
          {row.original.isNegative && (
            <span title={t('ui.col.negativeBalance')}>
              <AlertCircle className="nr-icon nr-icon-sm text-danger" />
            </span>
          )}
        </div>
      ),
    },
    {
      accessorKey: 'amount',
      header: t('ui.cashPosition.balanceIdr'),
      meta: { align: 'right' },
      cell: ({ getValue, row }) => (
        <span className={row.original.isNegative ? 'text-danger font-semibold' : undefined}>
          {formatMoneyFull(getValue() as string, lang)}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      title={t('ui.cashPosition.cashBalanceByEntity')}
      columns={columns}
      data={rows}
      getRowId={(r) => r.code}
      emptyMessage={t('common.noData')}
      mobileCard={(r) => (
        <div className="flex justify-between items-center">
          <div>
            <div className="font-semibold">{r.name}</div>
            <div className="text-xs text-ink-muted font-mono">{r.code}</div>
          </div>
          <span className={`font-semibold tabular-nums ${r.isNegative ? 'text-danger' : ''}`}>
            {formatMoneyFull(r.amount, lang)}
          </span>
        </div>
      )}
    />
  )
}
