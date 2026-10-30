import React from 'react'
import { flexRender } from '@tanstack/react-table'
import type { LegacyRow, LegacyCell, LegacyHeaderGroup, LegacyHeader } from '@tanstack/react-table/legacy'
import { useVirtualizer } from '@tanstack/react-virtual'
import { ChevronRight } from 'lucide-react'
import type { SortDir } from '~/lib/table/query'
import { SortHeader } from '~/components/neraca/DataTableParts'

/** Above this many rows the table draws only the rows in view. */
const VIRTUALIZE_ABOVE_ROWS = 200
const ESTIMATED_ROW_HEIGHT = 44

/** Which rows of a long table are in view: the scroll container, those rows and the blank space around them. */
export function useRowVirtualizer(rowCount: number) {
  const containerRef = React.useRef<HTMLDivElement>(null)
  const isVirtual = rowCount > VIRTUALIZE_ABOVE_ROWS
  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => containerRef.current,
    estimateSize: () => ESTIMATED_ROW_HEIGHT,
    overscan: 10,
    enabled: isVirtual,
  })

  const items = isVirtual ? virtualizer.getVirtualItems() : null
  const hasItems = items !== null && items.length > 0
  const paddingTop = hasItems ? (items[0]?.start ?? 0) : 0
  const paddingBottom = hasItems ? virtualizer.getTotalSize() - (items[items.length - 1]?.end ?? 0) : 0
  return { containerRef, isVirtual, items, paddingTop, paddingBottom }
}

export type RowVirtualizer = ReturnType<typeof useRowVirtualizer>

function ExpandToggle<T extends object>({ row }: { row: LegacyRow<T> }) {
  return (
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
  )
}

function DataCell<T extends object>({
  row,
  cell,
  isFirst,
}: {
  row: LegacyRow<T>
  cell: LegacyCell<T, unknown>
  isFirst: boolean
}) {
  const meta = cell.column.columnDef.meta as { align?: 'left' | 'right' | 'center' } | undefined
  return (
    <td
      className={meta?.align === 'right' ? 'nr-r' : undefined}
      style={{ paddingLeft: isFirst && row.depth > 0 ? `${row.depth * 20 + 16}px` : undefined }}
    >
      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
        {isFirst && row.getCanExpand() && <ExpandToggle row={row} />}
        {flexRender(cell.column.columnDef.cell, cell.getContext())}
      </div>
    </td>
  )
}

function DataRow<T extends object>({ row, onRowClick }: { row: LegacyRow<T>; onRowClick?: (row: T) => void }) {
  return (
    <tr
      onClick={(e) => {
        // If clicked directly on the expand button, don't trigger row click
        if ((e.target as HTMLElement).closest('.nr-table-expand-btn')) return
        onRowClick?.(row.original)
      }}
      style={{ cursor: onRowClick ? 'pointer' : 'default' }}
    >
      {row.getVisibleCells().map((cell: LegacyCell<T, unknown>, cellIdx: number) => (
        <DataCell key={cell.id} row={row} cell={cell} isFirst={cellIdx === 0} />
      ))}
    </tr>
  )
}

/** Blank space standing in for the rows scrolled out of view. */
function SpacerRow({ height, columnCount }: { height: number; columnCount: number }) {
  if (height <= 0) return null
  return (
    <tr>
      <td style={{ height: `${height}px`, padding: 0, border: 0 }} colSpan={columnCount} />
    </tr>
  )
}

/** The table body: the empty message, the rows in view of a long table, or every row. */
export function DataTableBody<T extends object>({
  rows,
  columnCount,
  emptyText,
  virtual,
  onRowClick,
}: {
  rows: LegacyRow<T>[]
  columnCount: number
  emptyText: string
  virtual: RowVirtualizer
  onRowClick?: (row: T) => void
}) {
  if (rows.length === 0) {
    return (
      <tbody>
        <tr>
          <td
            colSpan={columnCount}
            style={{ textAlign: 'center', padding: '36px 16px', color: 'var(--ink-muted)' }}
          >
            {emptyText}
          </td>
        </tr>
      </tbody>
    )
  }

  if (virtual.isVirtual && virtual.items) {
    return (
      <tbody>
        <SpacerRow height={virtual.paddingTop} columnCount={columnCount} />
        {virtual.items.map((virtualRow) => {
          const row = rows[virtualRow.index]
          return row ? <DataRow key={row.id} row={row} onRowClick={onRowClick} /> : null
        })}
        <SpacerRow height={virtual.paddingBottom} columnCount={columnCount} />
      </tbody>
    )
  }

  return (
    <tbody>
      {rows.map((row) => (
        <DataRow key={row.id} row={row} onRowClick={onRowClick} />
      ))}
    </tbody>
  )
}

/** The card list shown instead of the table on narrow screens. */
export function MobileCards<T extends object>({
  rows,
  emptyText,
  renderCard,
  onRowClick,
}: {
  rows: LegacyRow<T>[]
  emptyText: string
  renderCard: (row: T) => React.ReactNode
  onRowClick?: (row: T) => void
}) {
  return (
    <div className="mobile-cards">
      {rows.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 16px', color: 'var(--ink-muted)' }}>{emptyText}</div>
      ) : (
        rows.map((row) => (
          <div
            key={row.id}
            className="nr-mobile-card"
            onClick={() => onRowClick?.(row.original)}
            style={{ cursor: onRowClick ? 'pointer' : 'default' }}
          >
            {renderCard(row.original)}
          </div>
        ))
      )}
    </div>
  )
}

/** The header row(s); a column with a sort key is clickable and reports the new order. */
export function DataTableHead<T extends object>({
  headerGroups,
  sort,
  onSortChange,
}: {
  headerGroups: LegacyHeaderGroup<T>[]
  sort?: { by?: string; dir: SortDir }
  onSortChange?: (by: string, dir: SortDir) => void
}) {
  return (
    <thead>
      {headerGroups.map((headerGroup) => (
        <tr key={headerGroup.id}>
          {headerGroup.headers.map((header: LegacyHeader<T, unknown>) => (
            <SortHeader key={header.id} header={header} sort={sort} onSortChange={onSortChange} />
          ))}
        </tr>
      ))}
    </thead>
  )
}

/** The card title and the actions (export, print) beside it. */
export function CardHeader({ title, actions }: { title?: string; actions?: React.ReactNode }) {
  if (!title && !actions) return null
  return (
    <div className="nr-card-head">
      {title && <h3 className="nr-card-title">{title}</h3>}
      {actions && <div>{actions}</div>}
    </div>
  )
}
