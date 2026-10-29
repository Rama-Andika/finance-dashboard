import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeBudget, type BudgetResult } from '~/server/services/budget.service'

export const getBudgetFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<BudgetResult> => {
    const filter = await resolveFilter(data)
    return computeBudget(filter)
  })
