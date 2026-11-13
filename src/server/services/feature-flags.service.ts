import '@tanstack/react-start/server-only'
import { parseFeatureFlags } from '~/lib/feature-flags/parse'
import { allFlagsOff, type FeatureFlagName, type FeatureFlagState } from '~/lib/feature-flags/registry'
import { memo } from '~/server/cache'
import { createLogger } from '~/server/log'
import { readFeatureFlagsText } from '~/server/repo/feature-flags.repo'

const log = createLogger('flags')

/** How long the stored flags are reused before the database is asked again, like the user status check. */
export const FEATURE_FLAGS_TTL_MS = 60_000
export const FEATURE_FLAGS_CACHE_KEY = 'feature-flags:state'

async function load(): Promise<FeatureFlagState> {
  const parsed = parseFeatureFlags(await readFeatureFlagsText())
  if (parsed.problem === 'invalid') {
    log.warn({ reason: 'the stored text is not valid, so every flag is off' }, 'feature flags row is not valid')
  }
  return parsed.state
}

/**
 * The state of every known flag. Fails closed: when the row is missing or invalid, or the read fails, every flag is off.
 * The answer is shared and read only. A failed read is not remembered, so the next call asks again.
 */
export async function getFeatureFlags(): Promise<FeatureFlagState> {
  try {
    return await memo(FEATURE_FLAGS_CACHE_KEY, FEATURE_FLAGS_TTL_MS, load)
  } catch (error) {
    log.error({ err: error }, 'feature flags could not be read, so every flag is off')
    return allFlagsOff()
  }
}

export async function isFeatureEnabled(name: FeatureFlagName): Promise<boolean> {
  return (await getFeatureFlags())[name]
}

/**
 * For the start of a server function that sits behind a flag: lets the call go on when the flag is on, and otherwise
 * refuses it. The error is the public code FEATURE_DISABLED; the request id is added by the error middleware, so the
 * browser sees "FEATURE_DISABLED#<id>" and the log line below carries the same id. Call it after the authentication
 * middleware has run, as the first statement of the handler.
 */
export async function assertFeatureEnabled(name: FeatureFlagName): Promise<void> {
  if (await isFeatureEnabled(name)) return
  log.info({ feature: name }, 'request refused: the feature flag is off')
  throw new Error('FEATURE_DISABLED')
}
