import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { tableQuerySchema, type Page } from '~/lib/table/query'
import { PAYMENT_BILL_SORT_KEYS } from '~/lib/finance/payment-plan-bills'
import type { PaymentPlanBill } from '~/lib/finance/payment-plan'
import { resolveFilter } from '~/server/context'
import { exportPaymentPlanBills, listPaymentPlanBills } from '~/server/services/payment-plan.service'

const input = metricInputSchema.extend(tableQuerySchema(PAYMENT_BILL_SORT_KEYS).shape)
export type PaymentBillsInput = z.infer<typeof input>

/** Bills due in the next 7 days (Summary page), one sorted page at a time. */
export const getPaymentBillsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<Page<PaymentPlanBill>> => {
    const filter = await resolveFilter(data)
    return listPaymentPlanBills(filter, { horizon: '7', inflow: false }, {
      page: data.page,
      pageSize: data.pageSize,
      sortBy: data.sortBy,
      sortDir: data.sortDir,
    })
  })

const exportInput = metricInputSchema.extend({
  sortBy: tableQuerySchema(PAYMENT_BILL_SORT_KEYS).shape.sortBy,
  sortDir: tableQuerySchema(PAYMENT_BILL_SORT_KEYS).shape.sortDir,
})
export type PaymentBillsExportInput = z.infer<typeof exportInput>

/** Every bill of the 7-day plan (CSV export), in the order currently shown. */
export const exportPaymentBillsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => exportInput.parse(d))
  .handler(async ({ data }): Promise<PaymentPlanBill[]> => {
    const filter = await resolveFilter(data)
    return exportPaymentPlanBills(filter, { horizon: '7', inflow: false }, { sortBy: data.sortBy, sortDir: data.sortDir })
  })
