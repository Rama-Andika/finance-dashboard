import { isNotFound } from '@tanstack/react-router'
import type { QueryClient } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'

vi.mock('~/functions/feature-flags.fn', () => ({ getFeatureFlagsFn: vi.fn() }))

const { ensureFeatureEnabled, featureFlagsOptions } = await import('./feature-flags.queries')
const { qk } = await import('./keys')

function clientWith(state: { example: boolean }) {
  return { ensureQueryData: vi.fn(async () => state) } as unknown as Pick<QueryClient, 'ensureQueryData'>
}

describe('featureFlagsOptions', () => {
  it('reuses one answer for a minute and has its own key, apart from the metric prefixes', () => {
    expect(featureFlagsOptions().staleTime).toBe(60_000)
    expect(featureFlagsOptions().queryKey).toEqual(qk.featureFlags())
    expect(qk.featureFlags()[0]).not.toBe(qk.allMetrics()[0])
  })
})

describe('ensureFeatureEnabled', () => {
  it('lets the route load when the flag is on', async () => {
    await expect(ensureFeatureEnabled(clientWith({ example: true }), 'example')).resolves.toBeUndefined()
  })

  it('throws the not-found result when the flag is off', async () => {
    const error = await ensureFeatureEnabled(clientWith({ example: false }), 'example').catch((e: unknown) => e)
    expect(isNotFound(error)).toBe(true)
  })

  it('asks again when the saved answer is stale', async () => {
    const client = clientWith({ example: true })
    await ensureFeatureEnabled(client, 'example')
    expect(client.ensureQueryData).toHaveBeenCalledWith(expect.objectContaining({ revalidateIfStale: true }))
  })

  it('lets an error of the read go through', async () => {
    const client = { ensureQueryData: vi.fn(async () => Promise.reject(new Error('TIMEOUT'))) } as unknown as Pick<
      QueryClient,
      'ensureQueryData'
    >
    await expect(ensureFeatureEnabled(client, 'example')).rejects.toThrow('TIMEOUT')
  })
})
