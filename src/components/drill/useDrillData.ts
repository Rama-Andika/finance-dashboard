import { useMemo } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { drillOptions } from '~/queries/drill.queries'
import { drillSchema, MONTH_KEY_RE, PRESETS, type DrillState, type Preset } from '~/lib/filters/search-schema'

export type DrillSearchParams = {
  entity?: string
  preset?: string
  from?: string
  to?: string
  p13?: boolean
  drill?: unknown
}

export function parseDrill(raw: unknown): DrillState | null {
  if (!raw) return null
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    const parsed = drillSchema.safeParse(value)
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

/** One loaded page of a drill level (the server result: title, columns, rows, next level, caption flag). */
export type DrillPage = NonNullable<ReturnType<typeof useDrillData>['data']>

/** Fetches the current drill level page by page: `allRows` are the rows of every page loaded so far. */
export function useDrillData(search: DrillSearchParams, drill: DrillState | null, isOpen: boolean) {
  const preset: Preset = (PRESETS as readonly string[]).includes(search.preset ?? '')
    ? (search.preset as Preset)
    : 'this-month'

  const query = useInfiniteQuery({
    ...drillOptions({
      entity: search.entity ?? 'all',
      preset,
      from: MONTH_KEY_RE.test(search.from ?? '') ? search.from : undefined,
      to: MONTH_KEY_RE.test(search.to ?? '') ? search.to : undefined,
      p13: Boolean(search.p13),
      drill: drill ?? { metric: '', steps: [] },
    }),
    enabled: isOpen,
  })

  const pages = query.data?.pages
  const allRows = useMemo(() => (pages ?? []).flatMap((page) => page.rows), [pages])

  return {
    /** The first page: title, columns, next level, caption flag. Rows come from `allRows`. */
    data: pages?.[0],
    allRows,
    hasMore: Boolean(query.hasNextPage),
    loadMore: () => void query.fetchNextPage(),
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
  }
}
