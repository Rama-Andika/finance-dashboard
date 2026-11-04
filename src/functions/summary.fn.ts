import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import {
  computeSummaryCharts,
  computeSummaryHead,
  computeSummaryMini,
  type SummaryCharts,
  type SummaryHead,
  type SummaryMini,
} from '~/server/services/summary.service'

/** The Summary page loads in three parts; each has its own server function so a slow part never holds up a quick one. */
export const getSummaryHeadFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<SummaryHead> => computeSummaryHead(await resolveFilter(data)))

export const getSummaryChartsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<SummaryCharts> => computeSummaryCharts(await resolveFilter(data)))

export const getSummaryMiniFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<SummaryMini> => computeSummaryMini(await resolveFilter(data)))
