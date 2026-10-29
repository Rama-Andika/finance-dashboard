import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeArAging, type ArAgingResult } from '~/server/services/ar-aging.service'

/** The vendor/customer rows are served page by page (`getAgingPartiesFn`), not inside the metric. */
export type ArAgingMetric = Omit<ArAgingResult, 'byCustomer'>

export const getArAgingFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<ArAgingMetric> => {
    const filter = await resolveFilter(data)
    const { byCustomer: _parties, ...metric } = await computeArAging(filter)
    return metric
  })
