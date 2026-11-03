import { useSearch } from '@tanstack/react-router'
import { MONTH_KEY_RE, PRESETS, type MetricInput, type Preset } from '~/lib/filters/search-schema'

type GlobalSearch = { entity?: string; preset?: string; p13?: boolean; from?: string; to?: string }

/** The global filters (entity, period, period 13) from the URL, in the shape the metric queries expect. */
export function useGlobalMetricInput(): MetricInput {
  const search = useSearch({ strict: false }) as GlobalSearch
  const preset: Preset = (PRESETS as readonly string[]).includes(search.preset ?? '')
    ? (search.preset as Preset)
    : 'this-month'
  const range = MONTH_KEY_RE.test(search.from ?? '') && MONTH_KEY_RE.test(search.to ?? '') ? { from: search.from, to: search.to } : {}
  return { entity: search.entity ?? 'all', preset, p13: Boolean(search.p13), ...range }
}
