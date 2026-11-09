import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { DataTable, type ColumnDef } from '~/components/ui/data-table/DataTable'
import { PrintButton } from '~/components/export/PrintButton'
import { formatDate } from '~/lib/format/date'
import { formatMoneyFull, formatPercent } from '~/lib/format/number'
import { changeOf, changeRatioOf, type BalanceSheetNode } from '~/lib/finance/balance-sheet/statement'
import { defaultExpandedIds, tableRows } from '~/lib/finance/balance-sheet/tree-view'
import type { BalanceSheetResult } from '~/lib/finance/balance-sheet/result'
import type { Lang, Money } from '~/lib/core/types'

/** Sections, headers and the difference line are bold. */
const isEmphasis = (node: BalanceSheetNode): boolean =>
  node.kind === 'section' || node.kind === 'difference' || node.isHeader

function AccountCell({ node }: { node: BalanceSheetNode }) {
  const { t } = useTranslation()
  if (node.labelKey) {
    const tone =
      node.kind === 'difference' ? 'font-bold text-danger' : isEmphasis(node) ? 'font-bold text-ink' : undefined
    return <span className={tone}>{t(`balanceSheet.line.${node.labelKey}`)}</span>
  }
  return (
    <span className={isEmphasis(node) ? 'font-semibold text-ink' : undefined}>
      {node.code && <span className="text-ink-muted mr-2 nr-num">{node.code}</span>}
      {node.name}
    </span>
  )
}

function AmountCell({ node, value, lang }: { node: BalanceSheetNode; value: Money | null; lang: Lang }) {
  if (value === null) return null
  return <span className={isEmphasis(node) ? 'font-bold' : undefined}>{formatMoneyFull(value, lang)}</span>
}

/** The balance sheet as a tree: the two sections, their accounts, and (with a comparison) the change per row. */
export function BalanceSheetTable({
  data,
  hideZero,
  lang,
}: {
  data: BalanceSheetResult
  hideZero: boolean
  lang: Lang
}) {
  const { t } = useTranslation()
  const rows = useMemo(() => tableRows(data.statement, { hideZero }), [data.statement, hideZero])
  const hasCompare = data.statement.compareTotals !== null

  const asOf = (date: string) => t('balanceSheet.asOf', { date: formatDate(date, lang) })
  const compareHeader = data.compare?.period ? asOf(data.compare.period.reportDate) : ''
  const columns: ColumnDef<BalanceSheetNode, unknown>[] = [
    {
      id: 'account',
      header: t('balanceSheet.col.account'),
      cell: ({ row }) => <AccountCell node={row.original} />,
    },
    {
      id: 'amount',
      header: data.period ? asOf(data.period.reportDate) : '',
      meta: { align: 'right' },
      cell: ({ row }) => <AmountCell node={row.original} value={row.original.amount} lang={lang} />,
    },
  ]

  if (hasCompare) {
    columns.push(
      {
        id: 'compare',
        header: compareHeader,
        meta: { align: 'right' },
        cell: ({ row }) => <AmountCell node={row.original} value={row.original.compare} lang={lang} />,
      },
      {
        id: 'change',
        header: t('balanceSheet.col.change'),
        meta: { align: 'right' },
        cell: ({ row }) => (
          <AmountCell node={row.original} value={changeOf(row.original.amount, row.original.compare)} lang={lang} />
        ),
      },
      {
        id: 'changePct',
        header: t('balanceSheet.col.changePct'),
        meta: { align: 'right' },
        cell: ({ row }) => {
          const ratio = changeRatioOf(row.original.amount, row.original.compare)
          return <span className="text-ink-muted">{formatPercent(ratio, lang, 1)}</span>
        },
      },
    )
  }

  return (
    <DataTable
      title={t('nav.balanceSheet')}
      columns={columns}
      data={rows}
      getSubRows={(r) => r.children}
      getRowId={(r) => r.id}
      defaultExpanded={defaultExpandedIds(rows)}
      emptyMessage={t('common.noData')}
      headerActions={
        <div className="flex items-center gap-2">
          <PrintButton />
        </div>
      }
      mobileCard={(r) => (
        <div className="flex justify-between items-center gap-3">
          <AccountCell node={r} />
          <span className="tabular-nums">
            <AmountCell node={r} value={r.amount} lang={lang} />
          </span>
        </div>
      )}
    />
  )
}
