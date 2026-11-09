import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import type { BalanceTrendResult } from '~/lib/finance/balance-sheet/trend'
import { resolveFilter } from '~/server/context'
import { computeBalanceTrend } from '~/server/services/balance-sheet/balance-trend.service'

export const getBalanceTrendFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<BalanceTrendResult> => {
    const filter = await resolveFilter(data)
    return computeBalanceTrend(filter)
  })
