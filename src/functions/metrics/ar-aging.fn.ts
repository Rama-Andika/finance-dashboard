import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeArAging, type ArAgingResult } from '~/server/services/ar-aging.service'

export const getArAgingFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<ArAgingResult> => {
    const filter = await resolveFilter(data)
    return computeArAging(filter)
  })
