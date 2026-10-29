import { useNavigate, useSearch } from '@tanstack/react-router'
import { searchUpdater } from '~/lib/filters/search-update'
import { DEFAULT_PAGE_SIZE, PAGE_SIZES, type SortDir, type TableQuery } from '~/lib/table/query'

type TableSearch = { page?: number; pageSize?: number; sortBy?: string; sortDir?: SortDir }

/**
 * Page, page size and sort of one paged table, kept in the URL (so they survive a reload and can be
 * shared). Changing the sort or the page size goes back to page 1.
 */
export function useTableSearch<K extends string>(sortKeys: readonly K[]) {
  const search = useSearch({ strict: false }) as TableSearch
  const navigate = useNavigate()

  const query: TableQuery & { sortBy?: K } = {
    page: Number.isInteger(search.page) && (search.page ?? 0) >= 1 ? (search.page as number) : 1,
    pageSize: (PAGE_SIZES as readonly number[]).includes(search.pageSize ?? 0) ? (search.pageSize as number) : DEFAULT_PAGE_SIZE,
    sortBy: sortKeys.find((k) => k === search.sortBy),
    sortDir: search.sortDir === 'desc' ? 'desc' : 'asc',
  }

  const patch = (next: Partial<TableSearch>) =>
    navigate({ to: '.', search: searchUpdater((prev) => ({ ...prev, ...next })), replace: true })

  return {
    query,
    sort: { by: query.sortBy, dir: query.sortDir },
    setSort: (by: string, dir: SortDir) => {
      if (sortKeys.some((k) => k === by)) patch({ sortBy: by, sortDir: dir, page: 1 })
    },
    setPage: (page: number) => patch({ page }),
    setPageSize: (pageSize: number) => patch({ pageSize, page: 1 }),
  }
}
