import { queryOptions, type QueryClient } from '@tanstack/react-query'
import { notFound } from '@tanstack/react-router'
import { getFeatureFlagsFn } from '~/functions/feature-flags.fn'
import type { FeatureFlagName } from '~/lib/feature-flags/registry'
import { qk } from '~/queries/keys'

/** The same minute the server keeps its own answer for (FEATURE_FLAGS_TTL_MS), so a change shows up within about two minutes. */
const FEATURE_FLAGS_STALE_MS = 60_000

export const featureFlagsOptions = () =>
  queryOptions({
    queryKey: qk.featureFlags(),
    queryFn: () => getFeatureFlagsFn(),
    staleTime: FEATURE_FLAGS_STALE_MS,
  })

/**
 * For the beforeLoad of a route that sits behind a flag: shows the "page not found" page when the flag is off. An answer
 * older than the stale time is asked for again first. The server refuses the data of the page too (assertFeatureEnabled).
 */
export async function ensureFeatureEnabled(
  queryClient: Pick<QueryClient, 'ensureQueryData'>,
  name: FeatureFlagName,
): Promise<void> {
  const state = await queryClient.ensureQueryData({ ...featureFlagsOptions(), revalidateIfStale: true })
  if (!state[name]) throw notFound()
}
