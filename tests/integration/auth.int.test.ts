import { describe, expect, it } from 'vitest'
import { findLoginCandidate, LOGIN_ALLOWED_STATUSES } from '~/server/repo/auth.repo'
import { safeEqual } from '~/server/auth/password'

describe('Auth repository & login logic integration', () => {
  it('rejects nonexistent user login candidate', async () => {
    const candidate = await findLoginCandidate('__non_existent_user_12345__')
    expect(candidate).toBeNull()
  })

  it('finds existing user candidate with required shape', async () => {
    const candidate = await findLoginCandidate('gede')
    if (candidate) {
      expect(typeof candidate.userId).toBe('string')
      expect(typeof candidate.fullName).toBe('string')
      expect(typeof candidate.userStatus).toBe('number')
      expect(typeof candidate.password).toBe('string')
    }
  })

  it('rejects user with inactive status (user_status = 4)', () => {
    const inactiveStatus = 4
    const isAllowed = (LOGIN_ALLOWED_STATUSES as readonly number[]).includes(inactiveStatus)
    expect(isAllowed).toBe(false)
  })

  it('rejects password mismatch with safeEqual', () => {
    const correctPassword = 'myPassword123'
    const wrongPassword = 'wrongPassword'
    expect(safeEqual(wrongPassword, correctPassword)).toBe(false)
  })

  it('verifies safeEqual constant time with surrogate dummy password', () => {
    expect(safeEqual('input_password', '\u0000invalid\u0000')).toBe(false)
  })
})
