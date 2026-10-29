import { searchUpdater } from '~/lib/filters/search-update'
import { useNavigate } from '@tanstack/react-router'
import type { DrillStep } from '~/lib/filters/search-schema'

type SearchUpdater = (prev: Record<string, unknown>) => Record<string, unknown>

/** Opens the drill-down side sheet for a metric; the state lives in the `drill` search param (F5). */
export function useOpenDrill() {
  const navigate = useNavigate()
  return (metric: string, steps: DrillStep[]) => {
    const updater: SearchUpdater = (prev) => ({
      ...prev,
      drill: { metric, steps: steps.map((s) => ({ ...s, label: s.label.slice(0, 200) })) },
    })
    navigate({ to: '.', search: searchUpdater(updater), resetScroll: false })
  }
}
