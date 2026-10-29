import { queryOptions } from '@tanstack/react-query'
import { getFilterOptionsFn } from '~/functions/filters.fn'
import { qk } from './keys'

export const filterOptionsQueryOptions = () =>
  queryOptions({
    queryKey: qk.filterOptions(),
    queryFn: () => getFilterOptionsFn(),
    staleTime: 5 * 60 * 1000,
  })
