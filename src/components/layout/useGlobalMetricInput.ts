import { useSearch } from '@tanstack/react-router'
import { PRESETS, type MetricInput, type Preset } from '~/lib/filters/search-schema'

type GlobalSearch = { entity?: string; preset?: string; p13?: boolean }

/** The global filters (entity, period, period 13) from the URL, in the shape the metric queries expect. */
export function useGlobalMetricInput(): MetricInput {
  const search = useSearch({ strict: false }) as GlobalSearch
  const preset: Preset = (PRESETS as readonly string[]).includes(search.preset ?? '')
    ? (search.preset as Preset)
    : 'this-month'
  return { entity: search.entity ?? 'all', preset, p13: Boolean(search.p13) }
}
