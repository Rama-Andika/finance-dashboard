import { useTranslation } from 'react-i18next'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { StatusPill } from '~/components/neraca/StatusPill'
import { useOpenDrill } from '~/components/drill/useOpenDrill'
import { formatMoneyFull } from '~/lib/format/number'
import type { Lang } from '~/lib/core/types'
import type { InTransitDetailItem } from '~/lib/finance/cash/cash-position'

/** Funds in settlement per channel, with the age of the oldest transaction and an alert flag. */
export function InTransitTable({ rows, lang }: { rows: InTransitDetailItem[]; lang: Lang }) {
  const { t } = useTranslation()
  const openDrill = useOpenDrill()

  const columns: ColumnDef<InTransitDetailItem, unknown>[] = [
    {
      accessorKey: 'name',
      header: t('ui.col.channel'),
      cell: ({ row }) => <span className="nr-name">{row.original.name}</span>,
    },
    {
      accessorKey: 'count',
      header: t('ui.cashPosition.txCount'),
      meta: { align: 'right' },
      cell: ({ getValue }) => getValue(),
    },
    {
      accessorKey: 'oldestAgeDays',
      header: t('ui.cashPosition.oldestAge'),
      cell: ({ getValue }) => `${getValue()} ${t('ui.cashPosition.days')}`,
    },
    {
      accessorKey: 'amount',
      header: t('ui.cashPosition.amountIdr'),
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      id: 'status',
      header: t('ui.col.status'),
      cell: ({ row }) =>
        row.original.overAlertAge ? (
          <StatusPill tone="warning">{t('ui.cashPosition.overAlertAge')}</StatusPill>
        ) : (
          <StatusPill tone="neutral">{t('ui.cashPosition.normal')}</StatusPill>
        ),
    },
  ]

  return (
    <DataTable
      title={t('ui.cashPosition.inTransitByChannel')}
      columns={columns}
      data={rows}
      getRowId={(r) => r.coaId}
      onRowClick={(r) => openDrill('inTransit', [{ kind: 'channel', id: r.coaId, label: r.name }])}
      emptyMessage={t('common.noData')}
      mobileCard={(r) => (
        <div className="space-y-1">
          <div className="flex justify-between items-start">
            <span className="font-semibold">{r.name}</span>
            <span className="font-semibold tabular-nums">{formatMoneyFull(r.amount, lang)}</span>
          </div>
          <div className="text-xs text-ink-muted flex justify-between">
            <span>{t('ui.cashPosition.transactionsOldest', { count: r.count, days: r.oldestAgeDays })}</span>
            {r.overAlertAge && <StatusPill tone="warning">{t('ui.col.overAlertAge')}</StatusPill>}
          </div>
        </div>
      )}
    />
  )
}
