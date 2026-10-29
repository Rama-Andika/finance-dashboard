import { queryOptions } from '@tanstack/react-query'
import { getDataChecksFn } from '~/functions/data-checks.fn'
import type { MetricInput } from '~/lib/filters/search-schema'

export function dataChecksOptions(input: MetricInput) {
  return queryOptions({
    queryKey: ['data-checks', input],
    queryFn: () => getDataChecksFn({ data: input }),
    staleTime: 60 * 1000,
  })
}
