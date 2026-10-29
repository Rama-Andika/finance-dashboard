import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeCashPosition, type CashPositionResult } from '~/server/services/cash-position.service'

export const getCashPositionFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<CashPositionResult> => {
    const filter = await resolveFilter(data)
    return computeCashPosition(filter)
  })
