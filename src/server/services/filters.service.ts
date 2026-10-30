import '@tanstack/react-start/server-only'
import { PRESETS, type Preset } from '~/lib/filters/search-schema'
import type { IsoDate } from '~/lib/core/types'
import { resolvePeriod } from '~/lib/finance/period/periods'
import { appToday, getCachedEntities, getCachedPeriods } from '~/server/context'

export type FilterOptions = {
  /** `id` is the location id: the `entity` URL parameter is a comma-separated list of these (kept as strings). */
  entities: Array<{ id: string; code: string; name: string; isActive: boolean }>
  presets: Array<{ preset: Preset; from: IsoDate; to: IsoDate }> // month hints for PeriodSelect
  /** Calendar months that exist in the periode table (regular periods), newest first. */
  months: Array<{ month: string; status: 'Open' | 'Pre Closed' | 'Closed' }>
  today: IsoDate
}

/** Entities, period presets and calendar months for the global filter bar. */
export async function getFilterOptions(): Promise<FilterOptions> {
  const { entities } = await getCachedEntities()
  const periods = await getCachedPeriods()
  const today = appToday()

  const presetsHints = PRESETS.map((preset) => {
    const res = resolvePeriod(preset, false, today, periods)
    return {
      preset,
      from: res.d1,
      to: res.asOf,
    }
  })

  const monthStatus = new Map<string, 'Open' | 'Pre Closed' | 'Closed'>()
  for (const p of periods) {
    if (p.type === 0) monthStatus.set(p.startDate.slice(0, 7), p.status)
  }
  const months = Array.from(monthStatus.entries())
    .map(([month, status]) => ({ month, status }))
    .sort((a, b) => b.month.localeCompare(a.month))

  return {
    entities: entities.map((e) => ({
      id: e.locationId,
      code: e.code,
      name: e.name,
      isActive: e.isActive,
    })),
    presets: presetsHints,
    months,
    today,
  }
}
