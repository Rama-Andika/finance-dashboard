import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import type { Preset } from '~/lib/filters/search-schema'
import type { IsoDate } from '~/lib/finance/types'

export type FilterOptions = {
  entities: Array<{ code: string; name: string; isActive: boolean }> // no long IDs (F1)
  presets: Array<{ preset: Preset; from: IsoDate; to: IsoDate }> // month hints for PeriodSelect
  today: IsoDate
}

export const getFilterOptionsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<FilterOptions> => {
    const { getCachedEntities, getCachedPeriods } = await import('~/server/context')
    const { resolvePeriod } = await import('~/lib/finance/periods')
    const { todayIn } = await import('~/lib/format/date')
    const { env } = await import('~/server/env')
    const { PRESETS } = await import('~/lib/filters/search-schema')

    const { entities } = await getCachedEntities()
    const periods = await getCachedPeriods()
    const today = todayIn(env.APP_TIMEZONE)

    const presetsHints = PRESETS.map((preset) => {
      const res = resolvePeriod(preset, false, today, periods)
      return {
        preset,
        from: res.d1,
        to: res.asOf,
      }
    })

    return {
      entities: entities.map((e) => ({
        code: e.code,
        name: e.name,
        isActive: e.isActive,
      })),
      presets: presetsHints,
      today,
    }
  })
