import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import {
  computeRunwayMetrics,
  type RunwayResult,
} from '~/server/services/runway.service'

export const getRunwayFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<RunwayResult> => {
    const filter = await resolveFilter(data)
    return computeRunwayMetrics(filter)
  })
