import { useTranslation } from 'react-i18next'
import React from 'react'
import {
  useLegacyTable,
  getCoreRowModel,
  getExpandedRowModel,
  type LegacyColumnDef as ColumnDef,
} from '@tanstack/react-table/legacy'
import type { ExpandedState } from '@tanstack/react-table'
import { cn } from '~/lib/cn'
import type { SortDir } from '~/lib/table/query'
import { TablePager } from '~/components/neraca/DataTableParts'
import {
  CardHeader,
  DataTableBody,
  DataTableHead,
  MobileCards,
  useRowVirtualizer,
} from '~/components/neraca/DataTableRows'

export type { ColumnDef }

/** Column `meta` understood by the table. A column is sortable when it has a `sortKey`. */
export type TableColumnMeta = {
  align?: 'left' | 'right' | 'center'
  sortKey?: string
  /** Direction of the first click on this column (amounts usually start with the largest) */
  sortDefault?: SortDir
}

export interface DataTableProps<T extends object> {
  columns: ColumnDef<T, unknown>[]
  data: T[]
  /** Server-side sort: the table only shows the state and reports clicks; it never reorders rows itself. */
  sort?: { by?: string; dir: SortDir }
  onSortChange?: (by: string, dir: SortDir) => void
  /** Server-side paging: `data` is already one page; `total` is the size of the whole result. */
  pagination?: { page: number; pageSize: number; total: number }
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
  /** True while a new page / sort is loading (the old rows stay visible, dimmed) */
  isFetching?: boolean
  getRowId?: (row: T) => string
  getSubRows?: (row: T) => T[] | undefined
  onRowClick?: (row: T) => void
  mobileCard?: (row: T) => React.ReactNode
  emptyMessage?: string
  title?: string
  headerActions?: React.ReactNode
  className?: string
  defaultExpanded?: boolean
}

export function DataTable<T extends object>({
  columns,
  data,
  sort,
  onSortChange,
  pagination,
  onPageChange,
  onPageSizeChange,
  isFetching = false,
  getRowId,
  getSubRows,
  onRowClick,
  mobileCard,
  emptyMessage,
  title,
  headerActions,
  className,
  defaultExpanded = false,
}: DataTableProps<T>) {
  const { t } = useTranslation()
  const emptyText = emptyMessage ?? t('ui.shell.tableEmpty')
  const [expanded, setExpanded] = React.useState<ExpandedState>(defaultExpanded ? true : {})

  const table = useLegacyTable<T>({
    data,
    columns,
    state: {
      expanded,
    },
    onExpandedChange: setExpanded,
    getSubRows,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  const rows = table.getRowModel().rows
  const virtual = useRowVirtualizer(rows.length)

  return (
    <section className={cn('nr-card', mobileCard && 'nr-table-has-mobile', className)}>
      <CardHeader title={title} actions={headerActions} />

      {/* Desktop / regular table view */}
      <div
        ref={virtual.containerRef}
        className="nr-table-wrap"
        style={{
          ...(virtual.isVirtual ? { maxHeight: '600px', overflowY: 'auto' as const } : {}),
          opacity: isFetching ? 0.6 : 1,
          transition: 'opacity 120ms ease-out',
        }}
        aria-busy={isFetching}
      >
        <table className="nr-table">
          <DataTableHead headerGroups={table.getHeaderGroups()} sort={sort} onSortChange={onSortChange} />
          <DataTableBody
            rows={rows}
            columnCount={columns.length}
            emptyText={emptyText}
            virtual={virtual}
            onRowClick={onRowClick}
          />
        </table>
      </div>

      {pagination && (
        <TablePager pagination={pagination} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} />
      )}

      {/* Mobile cards view (active on screens < 768px when mobileCard prop is provided) */}
      {mobileCard && <MobileCards rows={rows} emptyText={emptyText} renderCard={mobileCard} onRowClick={onRowClick} />}
    </section>
  )
}
