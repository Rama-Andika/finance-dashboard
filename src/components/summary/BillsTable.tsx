import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { paymentBillsOptions, exportPaymentBills } from '~/queries/metrics.queries'
import { PAYMENT_BILL_SORT_KEYS, billReference, type BillScope } from '~/lib/finance/ap-ar/payment-plan-bills'
import { billExportColumns } from '~/components/summary/bills-export-columns'
import { useTableSearch } from '~/hooks/use-table-search'
import { DataTable, type ColumnDef } from '~/components/ui/data-table/DataTable'
import { Tabs } from '~/components/ui/Tabs'
import { PlanStatusPill } from '~/components/payment-plan/PlanStatusPill'
import { EntityCaption } from '~/components/ui/EntityCaption'
import { ExportCsvButton, exportFilename } from '~/components/export/ExportCsvDialog'
import type { MetricInput } from '~/lib/filters/search-schema'
import { PrintButton } from '~/components/export/PrintButton'
import { formatMoneyFull } from '~/lib/format/number'
import { formatDate } from '~/lib/format/date'
import type { Lang } from '~/lib/core/types'
import type { PaymentPlanBill } from '~/lib/finance/ap-ar/payment-plan'

type BillRenderOptions = {
  lang: Lang
  /** More than one entity is in scope: name the entity that owns each bill. */
  showEntity: boolean
  /** Some bill has a plan status; without one the status column and pill are left out. */
  planStatusInUse: boolean
}

/** Columns of the bills table: vendor (with the bill number or the credit label), due date, balance and plan status. */
function billColumns(options: BillRenderOptions & { t: TFunction }): ColumnDef<PaymentPlanBill, unknown>[] {
  const { t, lang, showEntity, planStatusInUse } = options
  const creditLabel = t('ui.col.creditRow')
  return [
    {
      accessorKey: 'vendorName',
      meta: { sortKey: 'vendorName' },
      header: t('ui.col.vendor'),
      cell: ({ row }) => (
        <div>
          <span className="nr-name">{row.original.vendorName}</span>
          <span className="nr-sub">{billReference(row.original, creditLabel)}</span>
          {showEntity && <EntityCaption name={row.original.entityName} />}
        </div>
      ),
    },
    {
      accessorKey: 'dueDate',
      meta: { sortKey: 'dueDate' },
      header: t('ui.col.dueDate'),
      cell: ({ getValue }) => formatDate(getValue() as string, lang),
    },
    {
      accessorKey: 'balance',
      header: t('ui.col.balance'),
      meta: { align: 'right', sortKey: 'balance', sortDefault: 'desc' },
      cell: ({ getValue }) => formatMoneyFull(getValue() as string, lang),
    },
    ...(planStatusInUse
      ? [
          {
            accessorKey: 'status',
            meta: { sortKey: 'status' },
            header: t('ui.col.status'),
            cell: ({ row }) => <PlanStatusPill status={row.original.status} />,
          } satisfies ColumnDef<PaymentPlanBill, unknown>,
        ]
      : []),
  ]
}

/** One bill as a card, for narrow screens. */
function BillMobileCard({ bill, lang, showEntity, planStatusInUse }: BillRenderOptions & { bill: PaymentPlanBill }) {
  const { t } = useTranslation()
  return (
    <>
      <div className="flex justify-between items-start">
        <div>
          <div className="font-semibold">{bill.vendorName}</div>
          <div className="text-xs font-mono text-ink-muted">{billReference(bill, t('ui.col.creditRow'))}</div>
          {showEntity && <EntityCaption name={bill.entityName} className="block text-xs text-ink-muted" />}
        </div>
        <div className="text-right">
          <div className="font-semibold tabular-nums">{formatMoneyFull(bill.balance, lang)}</div>
          <div className="text-xs text-ink-muted">{formatDate(bill.dueDate, lang)}</div>
        </div>
      </div>
      {planStatusInUse && (
        <div className="mt-1">
          <PlanStatusPill status={bill.status} />
        </div>
      )}
    </>
  )
}

/**
 * Open payables in two tabs: due within 7 days, and already past due.
 * Owns the tab choice and the paging/sorting state, so the page only passes the global filters.
 */
export function BillsTable({
  filters,
  lang,
  onRowClick,
}: {
  filters: MetricInput
  lang: Lang
  onRowClick: () => void
}) {
  const { t } = useTranslation()
  const table = useTableSearch(PAYMENT_BILL_SORT_KEYS)
  const [scope, setScope] = useState<BillScope>('due')
  const bills = useQuery(paymentBillsOptions({ ...filters, ...table.query, scope }))
  // While the first page loads, assume the status column is in use so the table does not jump.
  const planStatusInUse = bills.data?.planStatusInUse ?? true
  // The server sets this only when more than one entity is in scope.
  const showEntity = bills.data?.showEntity ?? false

  const columns = billColumns({ t, lang, showEntity, planStatusInUse })
  const exportColumns = billExportColumns({ t, showEntity, planStatusInUse })

  return (
    <>
      <div className="w-full max-w-xl">
        <Tabs<BillScope>
          tabs={[
            { id: 'due', label: t('metric.billsTabDue', { count: bills.data?.scopes.due.count ?? 0 }) },
            { id: 'overdue', label: t('metric.billsTabOverdue', { count: bills.data?.scopes.overdue.count ?? 0 }) },
          ]}
          value={scope}
          onChange={(id) => {
            setScope(id)
            table.setPage(1)
          }}
        />
      </div>
      <DataTable
        title={scope === 'overdue' ? t('metric.billsOverdue') : t('metric.billsDue7Days')}
        columns={columns}
        data={bills.data?.rows ?? []}
        getRowId={(r) => r.invoiceId}
        sort={table.sort}
        onSortChange={table.setSort}
        pagination={bills.data ? { page: bills.data.page, pageSize: bills.data.pageSize, total: bills.data.total } : undefined}
        onPageChange={table.setPage}
        onPageSizeChange={table.setPageSize}
        isFetching={bills.isFetching}
        onRowClick={onRowClick}
        headerActions={
          <div className="flex items-center gap-2">
            <ExportCsvButton
              loadRows={() =>
                exportPaymentBills({ ...filters, sortBy: table.query.sortBy, sortDir: table.query.sortDir, scope })
              }
              columns={exportColumns}
              filename={exportFilename('summary_bills_7d', filters)}
            />
            <PrintButton />
          </div>
        }
        emptyMessage={t('common.noData')}
        mobileCard={(r) => (
          <BillMobileCard bill={r} lang={lang} showEntity={showEntity} planStatusInUse={planStatusInUse} />
        )}
      />
    </>
  )
}
