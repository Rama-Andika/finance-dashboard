import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeRevenue, type RevenueResult } from '~/server/services/revenue.service'

export const getRevenueFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<RevenueResult> => {
    const filter = await resolveFilter(data)
    return computeRevenue(filter)
  })
