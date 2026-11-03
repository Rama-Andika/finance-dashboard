import { queryOptions } from '@tanstack/react-query'
import { getDataChecksFn } from '~/functions/data-checks.fn'
import { qk } from '~/queries/keys'
import type { MetricInput } from '~/lib/filters/search-schema'

export function dataChecksOptions(input: MetricInput) {
  return queryOptions({
    queryKey: qk.dataChecks(input),
    queryFn: () => getDataChecksFn({ data: input }),
    staleTime: 60 * 1000,
  })
}
