import { describe, expect, it, vi } from 'vitest'

vi.mock('~/functions/app-version.fn', () => ({ getAppVersionFn: vi.fn() }))

const { appVersionOptions } = await import('./app-version.queries')
const { qk } = await import('./keys')

describe('appVersionOptions', () => {
  it('asks again when the tab becomes visible, at most every 30 seconds', () => {
    expect(appVersionOptions().staleTime).toBe(30_000)
    expect(appVersionOptions().refetchOnWindowFocus).toBe(true)
  })

  it('has its own key, apart from the metric prefixes', () => {
    expect(appVersionOptions().queryKey).toEqual(qk.appVersion())
    expect(qk.appVersion()[0]).not.toBe(qk.allMetrics()[0])
  })
})
