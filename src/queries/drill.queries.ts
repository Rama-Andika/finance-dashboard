import { queryOptions } from '@tanstack/react-query'
import { getDrillFn, type DrillInput } from '~/functions/drill.fn'

export function drillOptions(input: DrillInput) {
  return queryOptions({
    queryKey: ['drill', input],
    queryFn: () => getDrillFn({ data: input }),
  })
}
