import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import type { FeatureFlagState } from '~/lib/feature-flags/registry'
import { getFeatureFlags } from '~/server/services/feature-flags.service'

export type { FeatureFlagState }

/** The state of every feature flag, for the menu, the routes and the cards. Signed-in users only. */
export const getFeatureFlagsFn = createServerFn({ method: 'GET' })
  .middleware([authMiddleware])
  .handler(async (): Promise<FeatureFlagState> => getFeatureFlags())
