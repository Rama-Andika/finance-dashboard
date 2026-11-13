import type { ReactNode } from 'react'
import { useFeatureFlag } from '~/hooks/use-feature-flag'
import type { FeatureFlagName } from '~/lib/feature-flags/registry'

/** Shows its children only while the flag is on, for example a card that is not finished. */
export function FeatureGate({ flag, children }: { flag: FeatureFlagName; children: ReactNode }) {
  return useFeatureFlag(flag) ? <>{children}</> : null
}
