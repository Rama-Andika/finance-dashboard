import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema, drillSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeDrill, type DrillResult } from '~/server/services/drill.service'

const drillInputSchema = metricInputSchema.extend({
  drill: drillSchema,
  offset: z.number().catch(0),
})

export type DrillInput = z.infer<typeof drillInputSchema>

export const getDrillFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => drillInputSchema.parse(d))
  .handler(async ({ data }): Promise<DrillResult> => {
    const filter = await resolveFilter(data)
    return computeDrill(filter, data.drill, data.offset)
  })
