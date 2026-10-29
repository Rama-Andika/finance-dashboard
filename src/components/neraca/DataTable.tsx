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
import { flexRender } from '@tanstack/react-table'
import { useVirtualizer } from '@tanstack/react-virtual'
import { cn } from '~/lib/cn'
import { ChevronRight } from 'lucide-react'

export type { ColumnDef }

export interface DataTableProps<T extends Record<string, any>> {
  columns: ColumnDef<T, any>[]
  data: T[]
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
  getRowId,
  getSubRows,
  onRowClick,
  mobileCard,
  emptyMessage = 'Tidak ada data',
  title,
  headerActions,
  className,
  defaultExpanded = false,
}: DataTableProps<T>) {
  const [expanded, setExpanded] = React.useState<Record<string, boolean> | true>(
    defaultExpanded ? true : {},
  )

  const table = useLegacyTable<T>({
    data,
    columns,
    state: {
      expanded,
    },
    onExpandedChange: setExpanded as any,
    getSubRows,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getExpandedRowModel: getExpandedRowModel(),
  })

  const rows = table.getRowModel().rows
  const isVirtual = rows.length > 200

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
        style={isVirtual ? { maxHeight: '600px', overflowY: 'auto' } : undefined}
      >
        <table className="nr-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup: LegacyHeaderGroup<T>) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header: LegacyHeader<T, any>) => {
                  const meta = header.column.columnDef.meta as { align?: 'left' | 'right' | 'center' } | undefined
                  const isRight =
                    meta?.align === 'right' ||
                    header.column.id.toLowerCase().includes('amount') ||
                    header.column.id.toLowerCase().includes('sisa') ||
                    header.column.id.toLowerCase().includes('saldo')
                  return (
                    <th key={header.id} className={isRight ? 'nr-r' : undefined}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(header.column.columnDef.header, header.getContext())}
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
                  {emptyMessage}
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

      {/* Mobile cards view (active on screens < 768px when mobileCard prop is provided) */}
      {mobileCard && (
        <div className="mobile-cards">
          {rows.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--ink-muted)' }}>
              {emptyMessage}
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
