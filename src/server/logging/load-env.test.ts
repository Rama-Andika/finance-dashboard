import { afterEach, describe, expect, it, vi } from 'vitest'
import { loadDotEnvOnce, resetDotEnvForTests } from './load-env'

afterEach(() => {
  vi.unstubAllEnvs()
  resetDotEnvForTests()
})

describe('loadDotEnvOnce', () => {
  it('loads the .env file once when DATABASE_URL is not set', () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('DATABASE_URL', '')
    const load = vi.fn()
    loadDotEnvOnce(load)
    loadDotEnvOnce(load)
    expect(load).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledWith('.env')
  })

  it('does not load it when DATABASE_URL is set (the real environment is in charge)', () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('DATABASE_URL', 'mysql://x')
    const load = vi.fn()
    loadDotEnvOnce(load)
    expect(load).not.toHaveBeenCalled()
  })

  it('does nothing under Vitest, so a test never picks up the settings of a developer', () => {
    vi.stubEnv('DATABASE_URL', '')
    const load = vi.fn()
    loadDotEnvOnce(load)
    expect(load).not.toHaveBeenCalled()
  })

  it('goes on when there is no .env file', () => {
    vi.stubEnv('VITEST', '')
    vi.stubEnv('DATABASE_URL', '')
    expect(() =>
      loadDotEnvOnce(() => {
        throw new Error('ENOENT')
      }),
    ).not.toThrow()
  })
})
