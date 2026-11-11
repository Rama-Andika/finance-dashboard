import type { SortDir } from '~/lib/table/query'

/** Column `meta` understood by the table. A column is sortable when it has a `sortKey`. */
export type TableColumnMeta = {
  align?: 'left' | 'right' | 'center'
  sortKey?: string
  /** Direction of the first click on this column (amounts usually start with the largest) */
  sortDefault?: SortDir
}
