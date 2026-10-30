import { useRouter, useRouterState } from '@tanstack/react-router'
import { searchUpdater } from '~/lib/filters/search-update'
import type { Preset, Horizon, GlobalSearch, PaymentPlanSearch } from '~/lib/filters/search-schema'

/** The global filters (entity, period, look-ahead) as they are in the URL, and the functions that change them. */
export function useTopBarFilters() {
  const router = useRouter()
  const currentPath = useRouterState({ select: (s) => s.location.pathname })
  const search = useRouterState({
    select: (s) => (s.location.search as Partial<GlobalSearch & PaymentPlanSearch>) || {},
  })

  const mergeSearch = (patch: Record<string, unknown>) => {
    router.navigate({ search: searchUpdater((prev) => ({ ...prev, ...patch })) })
  }

  return {
    isPaymentPlan: currentPath === '/payment-plan',
    currentEntity: (search.entity as string) || 'all',
    currentPreset: (search.preset as Preset) || 'this-month',
    currentFrom: search.from,
    currentTo: search.to,
    currentHorizon: (search.horizon as Horizon) || '7',
    handleEntityApply: (entity: string) => mergeSearch({ entity }),
    // A preset replaces any explicit month range
    handlePresetChange: (preset: Preset) => mergeSearch({ preset, from: undefined, to: undefined }),
    handleRangeChange: (from: string, to: string) => mergeSearch({ from, to }),
    handleHorizonChange: (horizon: Horizon) => mergeSearch({ horizon }),
  }
}
