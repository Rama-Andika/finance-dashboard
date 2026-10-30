import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { tableQuerySchema } from '~/lib/table/query'
import { EXPORT_CHUNK_SIZE, exportChunkShape } from '~/lib/table/export-chunks'
import { BILL_SCOPES, PAYMENT_BILL_SORT_KEYS } from '~/lib/finance/ap-ar/payment-plan-bills'
import { resolveFilter } from '~/server/context'
import { listPaymentPlanBills, type BillsPage } from '~/server/services/payment-plan.service'

/** Which tab of the bills table: due within 7 days, or already past due. */
const scopeShape = { scope: z.enum(BILL_SCOPES).catch('due') }

const input = metricInputSchema.extend(tableQuerySchema(PAYMENT_BILL_SORT_KEYS).shape).extend(scopeShape)
export type PaymentBillsInput = z.infer<typeof input>

/** Bills of the next 7 days or the overdue ones (Summary page), one sorted page at a time. */
export const getPaymentBillsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => input.parse(d))
  .handler(async ({ data }): Promise<BillsPage> => {
    const filter = await resolveFilter(data)
    return listPaymentPlanBills(
      filter,
      { horizon: '7', inflow: false },
      {
        page: data.page,
        pageSize: data.pageSize,
        sortBy: data.sortBy,
        sortDir: data.sortDir,
      },
      data.scope,
    )
  })

const exportChunkInput = metricInputSchema.extend(exportChunkShape(PAYMENT_BILL_SORT_KEYS)).extend(scopeShape)
export type PaymentBillsExportChunkInput = z.infer<typeof exportChunkInput>

/**
 * One chunk (`EXPORT_CHUNK_SIZE` rows) of the bills of one tab, in the order currently shown, for the CSV export.
 * The client asks for chunk 1, 2, 3, ... so no single response can exceed the server function size limit.
 */
export const getPaymentBillsExportChunkFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => exportChunkInput.parse(d))
  .handler(async ({ data }): Promise<BillsPage> => {
    const filter = await resolveFilter(data)
    return listPaymentPlanBills(
      filter,
      { horizon: '7', inflow: false },
      {
        page: data.page,
        pageSize: EXPORT_CHUNK_SIZE,
        sortBy: data.sortBy,
        sortDir: data.sortDir,
      },
      data.scope,
    )
  })
