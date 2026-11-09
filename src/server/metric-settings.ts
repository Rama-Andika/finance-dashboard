/**
 * The two cache settings of the computed metrics, in one place: env.ts validates them with these limits and cache.ts
 * reads them with the same limits. This module imports nothing, so cache.ts can use it without loading env.ts.
 */
export type SecondsSetting = { name: string; fallback: number; min: number; max: number }

/** How long a computed metric stays fresh. */
export const METRIC_FRESH_SETTING: SecondsSetting = { name: 'METRIC_FRESH_SECONDS', fallback: 60, min: 5, max: 3600 }

/** How long the old answer is still served, while one recalculation runs in the background (0 = never). */
export const METRIC_STALE_SETTING: SecondsSetting = { name: 'METRIC_STALE_SECONDS', fallback: 180, min: 0, max: 86_400 }
