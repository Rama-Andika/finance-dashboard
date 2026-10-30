import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { paymentBillsOptions, exportPaymentBills } from '~/queries/metrics.queries'
import { PAYMENT_BILL_SORT_KEYS, type BillScope } from '~/lib/finance/ap-ar/payment-plan-bills'
import { useTableSearch } from '~/components/neraca/useTableSearch'
import { DataTable, type ColumnDef } from '~/components/neraca/DataTable'
import { Tabs } from '~/components/neraca/Tabs'
import { PlanStatusPill } from '~/components/neraca/PlanStatusPill'
import { ExportCsvButton, exportFilename } from '~/components/export/ExportCsvDialog'
import type { MetricInput } from '~/lib/filters/search-schema'
import { PrintButton } from '~/components/export/PrintButton'
import { formatMoneyFull } from '~/lib/format/number'
import { formatDate } from '~/lib/format/date'
import type { Lang } from '~/lib/core/types'
import type { CsvColumn } from '~/lib/format/csv'
import type { PaymentPlanBill } from '~/lib/finance/ap-ar/payment-plan'

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

  const columns: ColumnDef<PaymentPlanBill, unknown>[] = [
    {
      accessorKey: 'vendorName',
      meta: { sortKey: 'vendorName' },
      header: t('ui.col.vendor'),
      cell: ({ row }) => (
        <div>
          <span className="nr-name">{row.original.vendorName}</span>
          <span className="nr-sub">{row.original.invoiceNumber}</span>
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

  const exportColumns: CsvColumn<PaymentPlanBill>[] = [
    { header: t('ui.col.billNumber'), value: (r) => r.invoiceNumber, kind: 'text' },
    { header: t('ui.col.vendor'), value: (r) => r.vendorName, kind: 'text' },
    { header: t('ui.col.dueDate'), value: (r) => r.dueDate, kind: 'date' },
    { header: t('ui.col.payableBalance'), value: (r) => r.balance, kind: 'money' },
    ...(planStatusInUse ? [{ header: t('ui.col.planStatus'), value: (r: PaymentPlanBill) => r.status, kind: 'text' as const }] : []),
  ]

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
          <>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-semibold">{r.vendorName}</div>
                <div className="text-xs font-mono text-ink-muted">{r.invoiceNumber}</div>
              </div>
              <div className="text-right">
                <div className="font-semibold tabular-nums">{formatMoneyFull(r.balance, lang)}</div>
                <div className="text-xs text-ink-muted">{formatDate(r.dueDate, lang)}</div>
              </div>
            </div>
            {planStatusInUse && (
              <div className="mt-1">
                <PlanStatusPill status={r.status} />
              </div>
            )}
          </>
        )}
      />
    </>
  )
}
