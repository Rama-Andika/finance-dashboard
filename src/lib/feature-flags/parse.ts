import { z } from 'zod'
import { allFlagsOff, FEATURE_FLAG_NAMES, type FeatureFlagState } from './registry'

/** The stored text: { "version": 1, "flags": { "<name>": true } }. Names the code does not know are ignored. */
const rowSchema = z.object({
  version: z.literal(1),
  flags: z.record(z.string(), z.unknown()),
})

export type FeatureFlagParse = {
  state: FeatureFlagState
  /** missing: no text stored; invalid: the text is not what rowSchema describes; null: fine. */
  problem: 'missing' | 'invalid' | null
}

/**
 * Turns the stored text into the state of every known flag. Fails closed: no text, text that is not JSON, or JSON of the
 * wrong shape turns every flag off. A flag is on only when its value is exactly the JSON value true ("true", 1 and "yes"
 * do not count). A name the code does not know is ignored, so a row written for a newer release never breaks an older one.
 */
export function parseFeatureFlags(valueprop: string | null): FeatureFlagParse {
  if (valueprop === null || valueprop.trim() === '') return { state: allFlagsOff(), problem: 'missing' }
  let raw: unknown
  try {
    raw = JSON.parse(valueprop)
  } catch {
    return { state: allFlagsOff(), problem: 'invalid' }
  }
  const parsed = rowSchema.safeParse(raw)
  if (!parsed.success) return { state: allFlagsOff(), problem: 'invalid' }
  const { flags } = parsed.data
  const state = Object.fromEntries(
    FEATURE_FLAG_NAMES.map((name) => [name, Object.hasOwn(flags, name) && flags[name] === true]),
  ) as Record<(typeof FEATURE_FLAG_NAMES)[number], boolean>
  return { state, problem: null }
}
