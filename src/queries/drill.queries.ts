import { infiniteQueryOptions } from '@tanstack/react-query'
import { getDrillFn, type DrillInput } from '~/functions/drill.fn'
import { qk } from '~/queries/keys'

/** Everything that identifies one drill level; the server pages it by `offset`, which the query supplies. */
export type DrillLevelInput = Omit<DrillInput, 'offset'>

/**
 * One drill level as pages of rows: "load more" asks for the next page, whose offset is the number of rows
 * already loaded. The pages live in the query, so there is no copy of the rows to keep in sync.
 */
export function drillOptions(input: DrillLevelInput) {
  return infiniteQueryOptions({
    queryKey: qk.drill(input),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => getDrillFn({ data: { ...input, offset: pageParam } }),
    getNextPageParam: (lastPage, allPages) =>
      lastPage.hasMore ? allPages.reduce((loaded, page) => loaded + page.rows.length, 0) : undefined,
  })
}
