import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeApAging, type ApAgingResult } from '~/server/services/ap-aging.service'

export const getApAgingFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<ApAgingResult> => {
    const filter = await resolveFilter(data)
    return computeApAging(filter)
  })
