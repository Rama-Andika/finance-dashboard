import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computeExpensePaid, type ExpensePaidResult } from '~/server/services/expense-paid.service'

export const getExpensePaidFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<ExpensePaidResult> => {
    const filter = await resolveFilter(data)
    return computeExpensePaid(filter)
  })
