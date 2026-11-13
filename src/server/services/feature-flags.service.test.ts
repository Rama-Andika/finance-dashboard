import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { captureLogs, resetLoggerForTests } from '~/server/logging/logger-core'

const readFeatureFlagsText = vi.fn()
vi.mock('~/server/repo/feature-flags.repo', () => ({
  readFeatureFlagsText: (...args: unknown[]) => readFeatureFlagsText(...args),
}))

const { assertFeatureEnabled, getFeatureFlags, isFeatureEnabled } = await import('./feature-flags.service')
const { clearCache } = await import('~/server/cache')

const ON = '{"version":1,"flags":{"example":true}}'

describe('getFeatureFlags', () => {
  beforeEach(() => {
    clearCache()
    readFeatureFlagsText.mockReset()
  })
  afterEach(() => resetLoggerForTests())

  it('returns the stored flags', async () => {
    readFeatureFlagsText.mockResolvedValue(ON)
    await expect(getFeatureFlags()).resolves.toEqual({ example: true })
  })

  it('is all off, and quiet, when no row is stored', async () => {
    const capture = captureLogs()
    readFeatureFlagsText.mockResolvedValue(null)
    await expect(getFeatureFlags()).resolves.toEqual({ example: false })
    const entries = capture.entries()
    capture.stop()
    expect(entries).toEqual([])
  })

  it('is all off, with a warning, when the stored text is not valid', async () => {
    const capture = captureLogs()
    readFeatureFlagsText.mockResolvedValue('{broken')
    await expect(getFeatureFlags()).resolves.toEqual({ example: false })
    const entries = capture.entries()
    capture.stop()
    expect(entries).toHaveLength(1)
    expect(entries[0]).toMatchObject({ level: 'warn', msg: 'feature flags row is not valid' })
  })

  it('is all off, with an error line, when the read fails, and asks again next time', async () => {
    const capture = captureLogs()
    readFeatureFlagsText.mockRejectedValueOnce(new Error('connect ECONNREFUSED'))
    await expect(getFeatureFlags()).resolves.toEqual({ example: false })
    readFeatureFlagsText.mockResolvedValue(ON)
    await expect(getFeatureFlags()).resolves.toEqual({ example: true })
    const entries = capture.entries()
    capture.stop()
    expect(entries[0]).toMatchObject({ level: 'error', msg: 'feature flags could not be read, so every flag is off' })
    expect(readFeatureFlagsText).toHaveBeenCalledTimes(2)
  })

  it('reads the database once for repeated calls', async () => {
    readFeatureFlagsText.mockResolvedValue(ON)
    await getFeatureFlags()
    await getFeatureFlags()
    expect(readFeatureFlagsText).toHaveBeenCalledTimes(1)
  })
})

describe('isFeatureEnabled', () => {
  beforeEach(() => {
    clearCache()
    readFeatureFlagsText.mockReset()
  })

  it('answers for one flag', async () => {
    readFeatureFlagsText.mockResolvedValue(ON)
    await expect(isFeatureEnabled('example')).resolves.toBe(true)
    clearCache()
    readFeatureFlagsText.mockResolvedValue('{"version":1,"flags":{"example":false}}')
    await expect(isFeatureEnabled('example')).resolves.toBe(false)
  })
})

describe('assertFeatureEnabled', () => {
  beforeEach(() => {
    clearCache()
    readFeatureFlagsText.mockReset()
  })
  afterEach(() => resetLoggerForTests())

  it('lets the call go on when the flag is on', async () => {
    readFeatureFlagsText.mockResolvedValue(ON)
    await expect(assertFeatureEnabled('example')).resolves.toBeUndefined()
  })

  it('refuses with FEATURE_DISABLED and logs which flag, when the flag is off', async () => {
    const capture = captureLogs()
    readFeatureFlagsText.mockResolvedValue('{"version":1,"flags":{"example":false}}')
    await expect(assertFeatureEnabled('example')).rejects.toThrow('FEATURE_DISABLED')
    const entries = capture.entries()
    capture.stop()
    expect(entries[0]).toMatchObject({ level: 'info', feature: 'example' })
  })

  it('refuses when the row is missing (fail closed)', async () => {
    readFeatureFlagsText.mockResolvedValue(null)
    await expect(assertFeatureEnabled('example')).rejects.toThrow('FEATURE_DISABLED')
  })
})
