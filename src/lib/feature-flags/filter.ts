import type { FeatureFlagName, FeatureFlagState } from './registry'

/** Keeps the items that have no flag, or whose flag is on. Used for menu items. */
export function keepEnabled<T extends { flag?: FeatureFlagName }>(items: readonly T[], state: FeatureFlagState): T[] {
  return items.filter((item) => item.flag === undefined || state[item.flag])
}
