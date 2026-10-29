import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeApAging, type ApAgingResult } from '~/server/services/ap-aging.service'

/** The vendor/customer rows are served page by page (`getAgingPartiesFn`), not inside the metric. */
export type ApAgingMetric = Omit<ApAgingResult, 'byVendor'>

export const getApAgingFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<ApAgingMetric> => {
    const filter = await resolveFilter(data)
    const { byVendor: _parties, ...metric } = await computeApAging(filter)
    return metric
  })
