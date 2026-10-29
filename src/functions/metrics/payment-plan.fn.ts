import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import {
  metricInputSchema,
  paymentPlanSearchSchema,
} from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import {
  computePaymentPlan,
  type PaymentPlanResult,
} from '~/server/services/payment-plan.service'

const inputSchema = metricInputSchema.extend(paymentPlanSearchSchema.shape)

export const getPaymentPlanFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => inputSchema.parse(d))
  .handler(async ({ data }): Promise<PaymentPlanResult> => {
    const filter = await resolveFilter(data)
    return computePaymentPlan(filter, {
      horizon: data.horizon,
      inflow: data.inflow,
    })
  })
