import { queryOptions } from '@tanstack/react-query'
import { getAccountMappingFn, getCoaTreeFn } from '~/functions/settings.fn'
import type { MetricInput } from '~/lib/filters/search-schema'
import { qk } from './keys'

export const accountMappingQueryOptions = () =>
  queryOptions({
    queryKey: qk.accountMapping(),
    queryFn: () => getAccountMappingFn(),
    staleTime: 5 * 60 * 1000,
  })

export const coaTreeQueryOptions = (input: MetricInput) =>
  queryOptions({
    queryKey: qk.coaTree(input),
    queryFn: () => getCoaTreeFn({ data: input }),
    staleTime: 5 * 60 * 1000,
  })
