import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { balanceSheetSearchSchema, metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import type { BalanceSheetResult } from '~/lib/finance/balance-sheet/result'
import { computeBalanceSheet } from '~/server/services/balance-sheet/balance-sheet.service'

const balanceSheetInputSchema = metricInputSchema.extend(balanceSheetSearchSchema.shape)

export const getBalanceSheetFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => balanceSheetInputSchema.parse(d))
  .handler(async ({ data }): Promise<BalanceSheetResult> => {
    const filter = await resolveFilter(data)
    return computeBalanceSheet(filter, data.compare)
  })
