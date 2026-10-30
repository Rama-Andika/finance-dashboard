import { useTranslation } from 'react-i18next'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { StatusPill } from '~/components/neraca/StatusPill'
import { ExportCsvButton, exportFilename, type ExportScope } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { formatMoneyFull } from '~/lib/format/number'
import { formatDate } from '~/lib/format/date'
import type { Lang } from '~/lib/core/types'
import type { PaymentPlanDay } from '~/lib/finance/ap-ar/payment-plan'

/** One row per day: opening, inflow, outflow, closing and a balance status. */
export function DailyScheduleTable({
  days,
  lang,
  scope,
  onSelectDay,
}: {
  days: PaymentPlanDay[]
  lang: Lang
  scope: ExportScope
  onSelectDay: (date: string) => void
}) {
  const { t } = useTranslation()

  const money = (key: 'opening' | 'inflow' | 'outflow', header: string): ColumnDef<PaymentPlanDay, unknown> => ({
    accessorKey: key,
    header,
    meta: { align: 'right' },
    cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
  })

  const columns: ColumnDef<PaymentPlanDay, unknown>[] = [
    {
      accessorKey: 'date',
      header: t('ui.paymentPlan.date'),
      cell: ({ getValue }) => <span className="nr-name">{formatDate(getValue() as string, lang)}</span>,
    },
    money('opening', t('ui.paymentPlan.openingIdr')),
    money('inflow', t('ui.paymentPlan.inflowIdr')),
    money('outflow', t('ui.paymentPlan.outflowIdr')),
    {
      accessorKey: 'closing',
      header: t('ui.paymentPlan.closingIdr'),
      meta: { align: 'right' },
      cell: ({ getValue, row }) => (
        <span className={row.original.isNegative ? 'text-danger font-semibold' : undefined}>
          {formatMoneyFull(getValue() as string, lang)}
        </span>
      ),
    },
    {
      id: 'status',
      header: t('ui.col.status'),
      cell: ({ row }) =>
        row.original.isNegative ? (
          <StatusPill tone="danger">{t('metric.minusBalance')}</StatusPill>
        ) : (
          <StatusPill tone="neutral">{t('metric.balanceSafe')}</StatusPill>
        ),
    },
  ]

  return (
    <DataTable
      title={t('ui.paymentPlan.dailyPaymentSchedule')}
      columns={columns}
      data={days}
      getRowId={(r) => r.date}
      onRowClick={(r) => onSelectDay(r.date)}
      emptyMessage={t('common.noData')}
      headerActions={
        <div className="flex items-center gap-2">
          <ExportCsvButton
            rows={days}
            columns={[
              { header: t('ui.col.date'), value: (r) => r.date, kind: 'date' },
              { header: t('ui.col.inflow'), value: (r) => r.inflow, kind: 'money' },
              { header: t('ui.col.outflow'), value: (r) => r.outflow, kind: 'money' },
              { header: t('ui.col.closingBalance'), value: (r) => r.closing, kind: 'money' },
            ]}
            filename={exportFilename('payment_plan', scope)}
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
            <span>
              {t('ui.paymentPlan.inflowShort')}: {formatMoneyFull(r.inflow, lang)}
            </span>
            <span>
              {t('ui.paymentPlan.outflowShort')}: {formatMoneyFull(r.outflow, lang)}
            </span>
          </div>
        </div>
      )}
    />
  )
}
