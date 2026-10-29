import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeFixedCost, type FixedCostResult } from '~/server/services/fixed-cost.service'

export const getFixedCostFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<FixedCostResult> => {
    const filter = await resolveFilter(data)
    return computeFixedCost(filter)
  })
