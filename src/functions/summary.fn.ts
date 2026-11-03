import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import {
  computeSummary,
  type SummaryResult,
} from '~/server/services/summary.service'

export const getSummaryFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<SummaryResult> => {
    const filter = await resolveFilter(data)
    return computeSummary(filter)
  })
