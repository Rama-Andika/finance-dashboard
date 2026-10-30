import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import type { MetricInput } from '~/lib/filters/search-schema'
import { AGING_PARTY_SORT_KEYS, type AgingPartyRow } from '~/lib/finance/ap-ar/aging-parties'
import type { Lang } from '~/lib/core/types'
import { formatMoneyFull } from '~/lib/format/number'
import { agingPartiesOptions, exportAgingParties } from '~/queries/metrics.queries'
import { useTableSearch } from '~/components/neraca/useTableSearch'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { ExportCsvButton, formatExportFilename } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { SIDES, type SideConfig } from './aging-sides'

/** Name of a vendor or customer; a party without a name reads "unknown vendor/customer". */
function partyNameOf(r: AgingPartyRow, cfg: SideConfig, t: TFunction): string {
  return r.name || t(cfg.keys.unknownParty)
}

function agingPartyColumns(cfg: SideConfig, lang: Lang, t: TFunction): ColumnDef<AgingPartyRow, unknown>[] {
  return [
    {
      accessorKey: 'name',
      meta: { sortKey: 'name' },
      header: t(cfg.keys.partyColumn),
      cell: ({ row }) => (
        <div>
          <span className="nr-name">{partyNameOf(row.original, cfg, t)}</span>
          <span className="nr-sub">{row.original.code}</span>
        </div>
      ),
    },
    {
      accessorKey: 'total',
      header: t(cfg.keys.totalColumn),
      meta: { align: 'right', sortKey: 'total', sortDefault: 'desc' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    {
      id: 'overdue',
      header: t(cfg.keys.overdueColumn),
      meta: { align: 'right', sortKey: 'overdue', sortDefault: 'desc' },
      cell: ({ row }) => (
        <span className="text-warning font-semibold">{formatMoneyFull(row.original.overdue, lang)}</span>
      ),
    },
  ]
}

/** The same row as a card, for narrow screens. */
function AgingPartyCard({ row, cfg, lang }: { row: AgingPartyRow; cfg: SideConfig; lang: Lang }) {
  const { t } = useTranslation()
  return (
    <div className="space-y-1">
      <div className="flex justify-between items-start">
        <div>
          <span className="font-semibold">{partyNameOf(row, cfg, t)}</span>
          <span className="text-xs text-ink-muted block font-mono">{row.code}</span>
        </div>
        <span className="font-semibold tabular-nums">{formatMoneyFull(row.total, lang)}</span>
      </div>
      {Number(row.overdue) > 0 && (
        <div className="text-xs text-warning flex justify-between">
          <span>{t(cfg.keys.overdueLabel)}</span>
          <span>{formatMoneyFull(row.overdue, lang)}</span>
        </div>
      )}
    </div>
  )
}

/** The vendor (payables) or customer (receivables) table: paged and sorted on the server, with CSV export. */
export function AgingPartiesTable({
  side,
  deps,
  lang,
  onOpenParty,
}: {
  side: 'ap' | 'ar'
  deps: MetricInput
  lang: Lang
  /** Opens the drill-down of one vendor or customer. */
  onOpenParty: (id: string, name: string) => void
}) {
  const cfg = SIDES[side]
  const { t } = useTranslation()
  const table = useTableSearch(AGING_PARTY_SORT_KEYS)
  const parties = useQuery(agingPartiesOptions({ ...deps, side, ...table.query }))
  const filePeriod = deps.from && deps.to ? `${deps.from}_${deps.to}` : deps.preset

  return (
    <DataTable
      title={t(cfg.keys.tableTitle)}
      columns={agingPartyColumns(cfg, lang, t)}
      data={parties.data?.rows ?? []}
      getRowId={(r) => r.id}
      sort={table.sort}
      onSortChange={table.setSort}
      pagination={
        parties.data
          ? { page: parties.data.page, pageSize: parties.data.pageSize, total: parties.data.total }
          : undefined
      }
      onPageChange={table.setPage}
      onPageSizeChange={table.setPageSize}
      isFetching={parties.isFetching}
      onRowClick={(r) => onOpenParty(r.id, r.name)}
      emptyMessage={t('common.noData')}
      headerActions={
        <div className="flex items-center gap-2">
          <ExportCsvButton
            loadRows={() =>
              exportAgingParties({ ...deps, side, sortBy: table.query.sortBy, sortDir: table.query.sortDir })
            }
            columns={[
              { header: t(cfg.keys.exportPartyCode), value: (r) => r.code, kind: 'text' },
              { header: t(cfg.keys.exportPartyName), value: (r) => partyNameOf(r, cfg, t), kind: 'text' },
              { header: t(cfg.keys.exportTotal), value: (r) => r.total, kind: 'money' },
              { header: t('ui.col.overdueAmount'), value: (r) => r.overdue, kind: 'money' },
            ]}
            filename={formatExportFilename(cfg.exportName, deps.entity, filePeriod)}
          />
          <PrintButton />
        </div>
      }
      mobileCard={(r) => <AgingPartyCard row={r} cfg={cfg} lang={lang} />}
    />
  )
}
