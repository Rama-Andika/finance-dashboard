import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { getFilterOptions, type FilterOptions } from '~/server/services/filters.service'

export type { FilterOptions }

export const getFilterOptionsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<FilterOptions> => getFilterOptions())
