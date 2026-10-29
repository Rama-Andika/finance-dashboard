import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema, type MetricInput } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeDataChecks, type DataCheckItem } from '~/server/services/data-checks.service'

export type { DataCheckItem }

export const getDataChecksFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<DataCheckItem[]> => {
    const filter = await resolveFilter(data)
    return computeDataChecks(filter)
  })
