import { useQuery } from '@tanstack/react-query'
import type { FeatureFlagName } from '~/lib/feature-flags/registry'
import { featureFlagsOptions } from '~/queries/feature-flags.queries'

/** True when the flag is on. False while the answer is still loading and when it cannot be read (fail closed). */
export function useFeatureFlag(name: FeatureFlagName): boolean {
  const { data } = useQuery(featureFlagsOptions())
  return data?.[name] ?? false
}
