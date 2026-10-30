import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { mappingSchema } from '~/lib/settings/mapping-schema'
import { metricInputSchema } from '~/lib/filters/search-schema'
import { resolveFilter } from '~/server/context'
import {
  getAccountMappingState,
  getCoaTreeWithBalances,
  saveAccountMapping,
  type CoaTreeNodeDto,
  type GetAccountMappingResult,
  type GetCoaTreeResult,
  type SaveAccountMappingResult,
} from '~/server/services/settings.service'

export type { CoaTreeNodeDto, GetAccountMappingResult, GetCoaTreeResult, SaveAccountMappingResult }

export const getAccountMappingFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<GetAccountMappingResult> => getAccountMappingState())

export const saveAccountMappingFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(mappingSchema)
  .handler(async ({ data }): Promise<SaveAccountMappingResult> => saveAccountMapping(data))

export const getCoaTreeFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .validator((d: unknown) => metricInputSchema.parse(d))
  .handler(async ({ data }): Promise<GetCoaTreeResult> => {
    const filter = await resolveFilter(data)
    return getCoaTreeWithBalances(filter)
  })
