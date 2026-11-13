import { afterAll, describe, expect, it } from 'vitest'
import { parseFeatureFlags } from '~/lib/feature-flags/parse'
import { FEATURE_FLAGS_KEY, readFeatureFlagsText } from '~/server/repo/feature-flags.repo'
import { upsertMapping } from '~/server/repo/settings.repo'

// Tests write to their own system_main row so the real feature flag row is never touched. The application itself never
// writes this row; the helper that saves the mapping is used here only to put test text into the test row.
const TEST_KEY = 'DASHBOARD_FEATURE_FLAGS_TEST'

describe('feature flags repository integration', () => {
  afterAll(async () => {
    // Leave the test row empty so it never looks like real flags.
    await upsertMapping('', TEST_KEY)
  })

  it('uses a test key that differs from the real key', () => {
    expect(TEST_KEY).not.toBe(FEATURE_FLAGS_KEY)
  })

  it('reads the stored text back, and it parses to the flags that were stored', async () => {
    await upsertMapping('{"version":1,"flags":{"example":true}}', TEST_KEY)
    const text = await readFeatureFlagsText(TEST_KEY)
    expect(parseFeatureFlags(text)).toEqual({ state: { example: true }, problem: null })
  })

  it('is all off when the stored text is broken or empty', async () => {
    await upsertMapping('{broken', TEST_KEY)
    expect(parseFeatureFlags(await readFeatureFlagsText(TEST_KEY))).toEqual({
      state: { example: false },
      problem: 'invalid',
    })
    await upsertMapping('', TEST_KEY)
    expect(parseFeatureFlags(await readFeatureFlagsText(TEST_KEY)).problem).toBe('missing')
  })

  it('answers null for a row that does not exist', async () => {
    expect(await readFeatureFlagsText('DASHBOARD_FEATURE_FLAGS_NEVER_CREATED')).toBeNull()
  })
})
