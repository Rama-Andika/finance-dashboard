import { useTranslation } from 'react-i18next'
import { Info } from 'lucide-react'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { ExportCsvButton, exportFilename, type ExportScope } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { useOpenDrill } from '~/components/drill/useOpenDrill'
import { formatMoneyFull, formatPercent } from '~/lib/format/number'
import type { Lang } from '~/lib/core/types'
import type { PnlLine, PnlLineKey } from '~/lib/finance/pnl/pnl'

/** Lines that are computed from other lines: bold, and they have no journals of their own to drill into. */
export const SUBTOTAL_KEYS = new Set<PnlLineKey>(['grossProfit', 'operatingProfit', 'netProfit'])

export function PnlStatementTable({ lines, lang, scope }: { lines: PnlLine[]; lang: Lang; scope: ExportScope }) {
  const { t } = useTranslation()
  const openDrill = useOpenDrill()

  const columns: ColumnDef<PnlLine, unknown>[] = [
    {
      accessorKey: 'key',
      header: t('ui.profitLoss.pLLine'),
      cell: ({ row }) => {
        const item = row.original
        const isSubtotal = SUBTOTAL_KEYS.has(item.key)
        return (
          <div className="flex items-center gap-1.5">
            <span className={isSubtotal ? 'font-bold text-ink' : undefined}>{t(`pnlLine.${item.key}`)}</span>
            {item.key === 'operatingProfit' && (
              <span
                className="text-xs text-muted inline-flex items-center cursor-help"
                title={t('ui.profitLoss.beforeDepreciationDeduction')}
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
      header: t('ui.col.marginPct'),
      meta: { align: 'right' },
      cell: ({ getValue, row }) => {
        const val = getValue() as string | null
        if (!val) return '—'
        return (
          <span className={SUBTOTAL_KEYS.has(row.original.key) ? 'font-semibold' : 'text-muted'}>
            {formatPercent(val, lang)}
          </span>
        )
      },
    },
    {
      accessorKey: 'amount',
      header: t('ui.profitLoss.totalIdr'),
      meta: { align: 'right' },
      cell: ({ getValue, row }) => (
        <span className={SUBTOTAL_KEYS.has(row.original.key) ? 'font-bold' : undefined}>
          {formatMoneyFull(getValue() as string, lang)}
        </span>
      ),
    },
  ]

  return (
    <DataTable
      title={t('ui.profitLoss.profitLossStatement')}
      columns={columns}
      data={lines}
      getRowId={(r) => r.key}
      onRowClick={(r) => {
        // Subtotals are computed lines; only account-backed lines open a drill-down.
        if (SUBTOTAL_KEYS.has(r.key)) return
        openDrill('pnl', [{ kind: 'section', id: r.key, label: t(`pnlLine.${r.key}`) }])
      }}
      emptyMessage={t('common.noData')}
      headerActions={
        <div className="flex items-center gap-2">
          <ExportCsvButton
            rows={lines}
            columns={[
              { header: t('ui.col.pnlLine'), value: (r) => t(`pnlLine.${r.key}`), kind: 'text' },
              { header: t('ui.col.amount'), value: (r) => r.amount, kind: 'money' },
              { header: t('ui.col.marginPct'), value: (r) => (r.margin ? formatPercent(r.margin, lang, 1) : ''), kind: 'text' },
            ]}
            filename={exportFilename('profit_loss', scope)}
          />
          <PrintButton />
        </div>
      }
      mobileCard={(r) => (
        <div className="flex justify-between items-center">
          <div>
            <span className={SUBTOTAL_KEYS.has(r.key) ? 'font-bold' : undefined}>{t(`pnlLine.${r.key}`)}</span>
            {r.margin && (
              <span className="text-xs text-muted block">
                {t('metric.margin')}: {formatPercent(r.margin, lang)}
              </span>
            )}
          </div>
          <span className={`tabular-nums ${SUBTOTAL_KEYS.has(r.key) ? 'font-bold' : ''}`}>
            {formatMoneyFull(r.amount, lang)}
          </span>
        </div>
      )}
    />
  )
}
