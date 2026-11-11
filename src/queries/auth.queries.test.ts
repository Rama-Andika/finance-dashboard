import { describe, expect, it, vi } from 'vitest'

vi.mock('~/functions/auth.fn', () => ({ getCurrentUserFn: vi.fn() }))

const { currentUserOptions } = await import('./auth.queries')
const { qk } = await import('./keys')

type StaleTimeOf = (query: { state: { data: unknown } }) => number

describe('currentUserOptions', () => {
  const staleTime = currentUserOptions().staleTime as StaleTimeOf

  it('reuses a signed-in answer for a minute', () => {
    expect(staleTime({ state: { data: { userId: '1', name: 'A' } } })).toBe(60_000)
  })

  it('asks again at once when nobody is signed in, so a login is seen on the next navigation', () => {
    expect(staleTime({ state: { data: null } })).toBe(0)
    expect(staleTime({ state: { data: undefined } })).toBe(0)
  })

  it('has its own key, apart from the metric prefixes', () => {
    expect(currentUserOptions().queryKey).toEqual(qk.currentUser())
    expect(qk.currentUser()[0]).not.toBe(qk.allMetrics()[0])
  })
})
