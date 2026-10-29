import { createServerFn } from '@tanstack/react-start'
import type { z } from 'zod'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { tableQuerySchema, type Page } from '~/lib/table/query'
import { EXPORT_CHUNK_SIZE } from '~/lib/table/export-chunks'
import { PAYMENT_BILL_SORT_KEYS } from '~/lib/finance/ap-ar/payment-plan-bills'
import type { PaymentPlanBill } from '~/lib/finance/ap-ar/payment-plan'
import { resolveFilter } from '~/server/context'
import { listPaymentPlanBills } from '~/server/services/payment-plan.service'

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

const exportTableShape = tableQuerySchema(PAYMENT_BILL_SORT_KEYS).shape
const exportChunkInput = metricInputSchema.extend({
  page: exportTableShape.page,
  sortBy: exportTableShape.sortBy,
  sortDir: exportTableShape.sortDir,
})
export type PaymentBillsExportChunkInput = z.infer<typeof exportChunkInput>

/**
 * One chunk (`EXPORT_CHUNK_SIZE` rows) of the 7-day plan, in the order currently shown, for the CSV export.
 * The client asks for chunk 1, 2, 3, ... so no single response can exceed the server function size limit.
 */
export const getPaymentBillsExportChunkFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => exportChunkInput.parse(d))
  .handler(async ({ data }): Promise<Page<PaymentPlanBill>> => {
    const filter = await resolveFilter(data)
    return listPaymentPlanBills(filter, { horizon: '7', inflow: false }, {
      page: data.page,
      pageSize: EXPORT_CHUNK_SIZE,
      sortBy: data.sortBy,
      sortDir: data.sortDir,
    })
  })
