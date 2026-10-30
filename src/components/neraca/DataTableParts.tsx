import { useTranslation } from 'react-i18next'
import type { LegacyHeader } from '@tanstack/react-table/legacy'
import { flexRender } from '@tanstack/react-table'
import { ChevronRight, ChevronLeft, ArrowUp, ArrowDown, ArrowUpDown } from 'lucide-react'
import { PAGE_SIZES, type SortDir } from '~/lib/table/query'
import type { TableColumnMeta } from '~/components/neraca/DataTable'

/** The `aria-sort` of a header: nothing when the column cannot be sorted, 'none' when it is not the sorted one. */
function ariaSortOf(sortable: boolean, isSorted: boolean, dir: SortDir | undefined) {
  if (!sortable) return undefined
  if (!isSorted) return 'none'
  return dir === 'asc' ? 'ascending' : 'descending'
}

/** One header cell: a plain label, or a button that asks for a server-side sort when the column has a `sortKey`. */
export function SortHeader<T extends object>({
  header,
  sort,
  onSortChange,
}: {
  header: LegacyHeader<T, unknown>
  sort?: { by?: string; dir: SortDir }
  onSortChange?: (by: string, dir: SortDir) => void
}) {
  const { t } = useTranslation()
  const meta = header.column.columnDef.meta as TableColumnMeta | undefined
  const isRight = meta?.align === 'right'
  const sortKey = onSortChange ? meta?.sortKey : undefined
  const isSorted = sortKey !== undefined && sort?.by === sortKey
  const content = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())

  const requestSort = (key: string, sortDefault: SortDir = 'asc') => {
    if (!onSortChange) return
    const next: SortDir = sort?.by === key ? (sort.dir === 'asc' ? 'desc' : 'asc') : sortDefault
    onSortChange(key, next)
  }

  return (
    <th
      className={isRight ? 'nr-r' : undefined}
      aria-sort={ariaSortOf(sortKey !== undefined, isSorted, sort?.dir)}
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
}

/** Server-side paging controls: range, rows per page and previous / next. */
export function TablePager({
  pagination,
  onPageChange,
  onPageSizeChange,
}: {
  pagination: { page: number; pageSize: number; total: number }
  onPageChange?: (page: number) => void
  onPageSizeChange?: (pageSize: number) => void
}) {
  const { t } = useTranslation()
  const pageCount = Math.max(1, Math.ceil(pagination.total / pagination.pageSize))
  const firstShown = pagination.total > 0 ? (pagination.page - 1) * pagination.pageSize + 1 : 0
  const lastShown = Math.min(pagination.total, pagination.page * pagination.pageSize)

  return (
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
  )
}
