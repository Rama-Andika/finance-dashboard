import { useTranslation } from 'react-i18next'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { KpiCard } from '~/components/neraca/KpiCard'
import { ExportCsvButton, exportFilename, type ExportScope } from '~/components/export/ExportCsvDialog'
import { PrintButton } from '~/components/export/PrintButton'
import { useOpenDrill } from '~/components/drill/useOpenDrill'
import { formatMoneyFull } from '~/lib/format/number'
import type { Breakdown, Lang, Money } from '~/lib/core/types'

/** The part of the expense-paid metric this panel shows. */
export type ExpensePaidPanelData = {
  total: Money
  apPayments: Money
  directPayments: Money
  byCategory: Breakdown[]
}

/** Sections that list vendors; every other category lists accounts. */
const VENDOR_SECTION_IDS = new Set(['apBills', 'unallocated'])

/** Three totals plus the category table, with a drill-down from category to vendor or account. */
export function ExpensePaidPanel({ data, lang, scope }: { data: ExpensePaidPanelData; lang: Lang; scope: ExportScope }) {
  const { t } = useTranslation()
  const openDrill = useOpenDrill()

  const columns: ColumnDef<Breakdown, unknown>[] = [
    {
      accessorKey: 'label',
      header: t('ui.cashFlow.expenseCategory'),
      cell: ({ row }) => <span className="nr-name">{row.original.label}</span>,
    },
    {
      accessorKey: 'amount',
      header: t('ui.cashFlow.paidAmountIdr'),
      meta: { align: 'right' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
  ]

  const kindOf = (categoryId: string) => (VENDOR_SECTION_IDS.has(categoryId) ? ('section' as const) : ('folder' as const))

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <KpiCard label={t('ui.cashFlow.totalExpensePaid')} value={data.total} higherIsBetter={false} />
        <KpiCard label={t('ui.cashFlow.apPayments')} value={data.apPayments} higherIsBetter={false} />
        <KpiCard label={t('ui.cashFlow.directPayments')} value={data.directPayments} higherIsBetter={false} />
      </div>

      <DataTable
        title={t('ui.cashFlow.expensePaidByCategory')}
        columns={columns}
        data={data.byCategory}
        getRowId={(r) => r.id}
        getSubRows={(r) => r.children}
        onRowClick={(r) => {
          const isCategory = data.byCategory.some((c) => c.id === r.id)
          const parent = data.byCategory.find((c) => (c.children ?? []).some((ch) => ch.id === r.id))
          if (isCategory) {
            openDrill('expensePaid', [{ kind: kindOf(r.id), id: r.id, label: r.label }])
          } else if (parent) {
            const parentKind = kindOf(parent.id)
            const childKind = parentKind === 'section' ? 'vendor' : 'account'
            openDrill('expensePaid', [
              { kind: parentKind, id: parent.id, label: parent.label },
              { kind: childKind, id: r.id, label: r.label },
            ])
          }
        }}
        emptyMessage={t('common.noData')}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              rows={data.byCategory}
              columns={[
                { header: t('ui.col.expenseCategory'), value: (r) => r.label, kind: 'text' },
                { header: t('ui.col.amount'), value: (r) => r.amount, kind: 'money' },
              ]}
              filename={exportFilename('expense_paid', scope)}
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
    </div>
  )
}
