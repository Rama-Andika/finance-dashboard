import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema, paymentPlanSearchSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import { computePaymentPlanSummary, type PaymentPlanResult } from '~/server/services/ap-ar/payment-plan.service'

const inputSchema = metricInputSchema.extend(paymentPlanSearchSchema.shape)

/**
 * The plan without its bill list: the bills can number in the tens of thousands (all overdue ones),
 * and the UI reads them one page at a time through `getPaymentBillsFn`, so they must not ride along here.
 */
export type PaymentPlanSummary = Omit<PaymentPlanResult, 'bills'>

export const getPaymentPlanFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<PaymentPlanSummary> => {
    const filter = await resolveFilter(data)
    return computePaymentPlanSummary(filter, {
      horizon: data.horizon,
      inflow: data.inflow,
    })
  })
