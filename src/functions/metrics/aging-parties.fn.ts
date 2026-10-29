import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { tableQuerySchema } from '~/lib/table/query'
import { EXPORT_CHUNK_SIZE } from '~/lib/table/export-chunks'
import { AGING_PARTY_SORT_KEYS, type AgingPartyRow } from '~/lib/finance/aging-parties'
import type { Page } from '~/lib/table/query'
import { resolveFilter } from '~/server/context'
import { listAgingParties } from '~/server/services/aging-parties.service'

const pagedInput = metricInputSchema
  .extend({ side: z.enum(['ap', 'ar']) })
  .extend(tableQuerySchema(AGING_PARTY_SORT_KEYS).shape)

export type AgingPartiesInput = z.infer<typeof pagedInput>

/** One page of the vendor (AP) or customer (AR) aging table. */
export const getAgingPartiesFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => pagedInput.parse(d))
  .handler(async ({ data }): Promise<Page<AgingPartyRow>> => {
    const filter = await resolveFilter(data)
    return listAgingParties(data.side, filter, {
      page: data.page,
      pageSize: data.pageSize,
      sortBy: data.sortBy,
      sortDir: data.sortDir,
    })
  })

const exportTableShape = tableQuerySchema(AGING_PARTY_SORT_KEYS).shape
const exportChunkInput = metricInputSchema.extend({
  side: z.enum(['ap', 'ar']),
  page: exportTableShape.page,
  sortBy: exportTableShape.sortBy,
  sortDir: exportTableShape.sortDir,
})
export type AgingPartiesExportChunkInput = z.infer<typeof exportChunkInput>

/**
 * One chunk (`EXPORT_CHUNK_SIZE` rows) of the aging table, in the order currently shown, for the CSV export.
 * The client asks for chunk 1, 2, 3, ... so no single response can exceed the server function size limit.
 */
export const getAgingPartiesExportChunkFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => exportChunkInput.parse(d))
  .handler(async ({ data }): Promise<Page<AgingPartyRow>> => {
    const filter = await resolveFilter(data)
    return listAgingParties(data.side, filter, {
      page: data.page,
      pageSize: EXPORT_CHUNK_SIZE,
      sortBy: data.sortBy,
      sortDir: data.sortDir,
    })
  })
