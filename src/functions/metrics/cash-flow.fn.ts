import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeCashFlow, type CashFlowResult } from '~/server/services/cash-flow.service'

export const getCashFlowFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<CashFlowResult> => {
    const filter = await resolveFilter(data)
    return computeCashFlow(filter)
  })
