import { useTranslation } from 'react-i18next'
import React from 'react'
import {
  useLegacyTable,
  getCoreRowModel,
  getExpandedRowModel,
  type LegacyColumnDef as ColumnDef,
  type LegacyRow,
  type LegacyHeaderGroup,
  type LegacyHeader,
  type LegacyCell,
} from '@tanstack/react-table/legacy'
import { flexRender, type ExpandedState } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '~/lib/cn'
import { ChevronRight, ChevronLeft, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { PAGE_SIZES, type SortDir } from '~/lib/table/query'

export type { ColumnDef }

/** Column `meta` understood by the table. A column is sortable when it has a `sortKey`. */
export type TableColumnMeta = {
  align?: 'left' | 'right' | 'center'
  sortKey?: string
  /** Direction of the first click on this column (amounts usually start with the largest) */
  sortDefault?: SortDir
}

export interface DataTableProps<T extends Record<string, any>> {
  columns: ColumnDef<T, any>[]
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

export function DataTable<T extends Record<string, any>>({
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
  const [expanded, setExpanded] = React.useState<ExpandedState>(
    defaultExpanded ? true : {},
  )

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
  const isVirtual = rows.length > 200

  const requestSort = (sortKey: string, sortDefault: SortDir = 'asc') => {
    if (!onSortChange) return
    const next: SortDir = sort?.by === sortKey ? (sort.dir === 'asc' ? 'desc' : 'asc') : sortDefault
    onSortChange(sortKey, next)
  }

  const pageCount = pagination ? Math.max(1, Math.ceil(pagination.total / pagination.pageSize)) : 1
  const firstShown = pagination && pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0
  const lastShown = pagination ? Math.min(pagination.total, pagination.page * pagination.pageSize) : 0

  const tableContainerRef = React.useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => tableContainerRef.current,
    estimateSize: () => 44,
    overscan: 10,
    enabled: isVirtual,
  })

  const virtualItems = isVirtual ? rowVirtualizer.getVirtualItems() : null
  const totalVirtualSize = isVirtual ? rowVirtualizer.getTotalSize() : 0

  const paddingTop =
    isVirtual && virtualItems && virtualItems.length > 0
      ? virtualItems[0]?.start ?? 0
      : 0
  const paddingBottom =
    isVirtual && virtualItems && virtualItems.length > 0
      ? totalVirtualSize - (virtualItems[virtualItems.length - 1]?.end ?? 0)
      : 0

  const renderRow = (row: LegacyRow<T>) => {
    return (
      <tr
        key={row.id}
        onClick={(e) => {
          // If clicked directly on the expand button, don't trigger row click
          if ((e.target as HTMLElement).closest('.nr-table-expand-btn')) return
          onRowClick?.(row.original)
        }}
        style={{
          cursor: onRowClick ? 'pointer' : 'default',
        }}
      >
        {row.getVisibleCells().map((cell: LegacyCell<T, any>, cellIdx: number) => {
          const meta = cell.column.columnDef.meta as { align?: 'left' | 'right' | 'center' } | undefined
          const isRight =
            meta?.align === 'right' ||
            cell.column.id.toLowerCase().includes('amount') ||
            cell.column.id.toLowerCase().includes('sisa') ||
            cell.column.id.toLowerCase().includes('saldo')
          const isFirst = cellIdx === 0

          return (
            <td
              key={cell.id}
              className={isRight ? 'nr-r' : undefined}
              style={{
                paddingLeft: isFirst && row.depth > 0 ? `${row.depth * 20 + 16}px` : undefined,
              }}
            >
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {isFirst && row.getCanExpand() && (
                  <button
                    type="button"
                    className="nr-table-expand-btn"
                    onClick={(e) => {
                      e.stopPropagation()
                      row.toggleExpanded()
                    }}
                    aria-label={row.getIsExpanded() ? 'Collapse row' : 'Expand row'}
                  >
                    <ChevronRight
                      className="nr-icon nr-icon-sm"
                      style={{
                        transform: row.getIsExpanded() ? 'rotate(90deg)' : 'none',
                        transition: 'transform 0.15s ease',
                      }}
                    />
                  </button>
                )}
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </div>
            </td>
          )
        })}
      </tr>
    )
  }

  return (
    <section className={cn('nr-card', mobileCard && 'nr-table-has-mobile', className)}>
      {(title || headerActions) && (
        <div className="nr-card-head">
          {title && <h3 className="nr-card-title">{title}</h3>}
          {headerActions && <div>{headerActions}</div>}
        </div>
      )}

      {/* Desktop / regular table view */}
      <div
        ref={tableContainerRef}
        className="nr-table-wrap"
        style={{
          ...(isVirtual ? { maxHeight: '600px', overflowY: 'auto' as const } : {}),
          opacity: isFetching ? 0.6 : 1,
          transition: 'opacity 120ms ease-out',
        }}
        aria-busy={isFetching}
      >
        <table className="nr-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup: LegacyHeaderGroup<T>) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header: LegacyHeader<T, any>) => {
                  const meta = header.column.columnDef.meta as TableColumnMeta | undefined
                  const isRight =
                    meta?.align === 'right' ||
                    header.column.id.toLowerCase().includes('amount') ||
                    header.column.id.toLowerCase().includes('sisa') ||
                    header.column.id.toLowerCase().includes('saldo')
                  const sortKey = onSortChange ? meta?.sortKey : undefined
                  const isSorted = sortKey !== undefined && sort?.by === sortKey
                  const content = header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())
                  return (
                    <th
                      key={header.id}
                      className={isRight ? 'nr-r' : undefined}
                      aria-sort={isSorted ? (sort?.dir === 'asc' ? 'ascending' : 'descending') : sortKey ? 'none' : undefined}
                    >
                      {sortKey ? (
                        <button
                          type="button"
                          className="nr-sort-btn"
                          onClick={() => requestSort(sortKey, meta?.sortDefault)}
                          title={t('ui.table.sortBy')}
                        >
                          {content}
                          {isSorted ? (
                            sort?.dir === 'asc' ? (
                              <ArrowUp className="nr-icon nr-icon-sm" aria-hidden="true" />
                            ) : (
                              <ArrowDown className="nr-icon nr-icon-sm" aria-hidden="true" />
                            )
                          ) : (
                            <ArrowUpDown className="nr-icon nr-icon-sm nr-sort-idle" aria-hidden="true" />
                          )}
                        </button>
                      ) : (
                        content
                      )}
                    </th>
                  )
                })}
              </tr>
            ))}
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{
                    textAlign: 'center',
                    padding: '36px 16px',
                    color: 'var(--ink-muted)',
                  }}
                >
                  {emptyText}
                </td>
              </tr>
            ) : isVirtual && virtualItems ? (
              <>
                {paddingTop > 0 && (
                  <tr>
                    <td style={{ height: `${paddingTop}px`, padding: 0, border: 0 }} colSpan={columns.length} />
                  </tr>
                )}
                {virtualItems.map((virtualRow) => {
                  const row = rows[virtualRow.index]!
                  return renderRow(row)
                })}
                {paddingBottom > 0 && (
                  <tr>
                    <td style={{ height: `${paddingBottom}px`, padding: 0, border: 0 }} colSpan={columns.length} />
                  </tr>
                )}
              </>
            ) : (
              rows.map((row: LegacyRow<T>) => renderRow(row))
            )}
          </tbody>
        </table>
      </div>

      {pagination && (
        <nav className="nr-pager" aria-label={t('ui.table.pagination')}>
          <span className="nr-pager-info">
            {t('ui.table.range', {
              from: firstShown.toLocaleString('en-US'),
              to: lastShown.toLocaleString('en-US'),
              total: pagination.total.toLocaleString('en-US'),
            })}
          </span>
          <label className="nr-pager-size">
            {t('ui.table.rowsPerPage')}
            <select
              value={pagination.pageSize}
              onChange={(e) => onPageSizeChange?.(Number(e.target.value))}
              className="nr-select"
            >
              {PAGE_SIZES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <div className="nr-pager-nav">
            <button
              type="button"
              className="nr-btn"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange?.(pagination.page - 1)}
              aria-label={t('ui.table.prev')}
            >
              <ChevronLeft className="nr-icon nr-icon-sm" aria-hidden="true" />
            </button>
            <span className="nr-pager-page">{t('ui.table.pageOf', { page: pagination.page, pages: pageCount })}</span>
            <button
              type="button"
              className="nr-btn"
              disabled={pagination.page >= pageCount}
              onClick={() => onPageChange?.(pagination.page + 1)}
              aria-label={t('ui.table.next')}
            >
              <ChevronRight className="nr-icon nr-icon-sm" aria-hidden="true" />
            </button>
          </div>
        </nav>
      )}

      {/* Mobile cards view (active on screens < 768px when mobileCard prop is provided) */}
      {mobileCard && (
        <div className="mobile-cards">
          {rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--ink-muted)' }}>
              {emptyText}
            </div>
          ) : (
            rows.map((row: LegacyRow<T>) => (
              <div
                key={row.id}
                className="nr-mobile-card"
                onClick={() => onRowClick?.(row.original)}
                style={{ cursor: onRowClick ? 'pointer' : 'default' }}
              >
                {mobileCard(row.original)}
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}
