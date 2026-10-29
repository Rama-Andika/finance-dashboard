import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computePnl, type PnlResult } from '~/server/services/pnl.service'

export const getPnlFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<PnlResult> => {
    const filter = await resolveFilter(data)
    return computePnl(filter)
  })
