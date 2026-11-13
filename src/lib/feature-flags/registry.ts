/**
 * Every feature flag the code knows. A flag is a switch the owner turns on or off for a whole deployment in the database
 * (docs/project-guide.md chapter 10.10). Add a name here before using it anywhere: the type below makes a typo a compile error.
 * "example" does nothing; it exists so that tests and the owner's instructions have a harmless flag to use.
 */
export const FEATURE_FLAG_NAMES = ['example'] as const

export type FeatureFlagName = (typeof FEATURE_FLAG_NAMES)[number]

/** The state of every known flag. Read only. */
export type FeatureFlagState = Readonly<Record<FeatureFlagName, boolean>>

/** Every known flag off. This is the state when anything about the stored row is wrong. */
export function allFlagsOff(): FeatureFlagState {
  return Object.fromEntries(FEATURE_FLAG_NAMES.map((name) => [name, false])) as Record<FeatureFlagName, boolean>
}
