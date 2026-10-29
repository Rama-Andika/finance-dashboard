import { createServerFn } from '@tanstack/react-start'
import { z } from 'zod'
import { authMiddleware } from '~/functions/middleware'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { tableQuerySchema } from '~/lib/table/query'
import { AGING_PARTY_SORT_KEYS, type AgingPartyRow } from '~/lib/finance/aging-parties'
import type { Page } from '~/lib/table/query'
import { resolveFilter } from '~/server/context'
import { exportAgingParties, listAgingParties } from '~/server/services/aging-parties.service'

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

const exportInput = metricInputSchema
  .extend({ side: z.enum(['ap', 'ar']) })
  .extend({
    sortBy: tableQuerySchema(AGING_PARTY_SORT_KEYS).shape.sortBy,
    sortDir: tableQuerySchema(AGING_PARTY_SORT_KEYS).shape.sortDir,
  })

/** Every row of the table (CSV export), in the order currently shown. */
export const exportAgingPartiesFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => exportInput.parse(d))
  .handler(async ({ data }): Promise<AgingPartyRow[]> => {
    const filter = await resolveFilter(data)
    return exportAgingParties(data.side, filter, { sortBy: data.sortBy, sortDir: data.sortDir })
  })
