import { beforeEach, describe, expect, it, vi } from 'vitest'

const findUserById = vi.fn()

vi.mock('~/server/repo/auth.repo', () => ({
  findUserById: (...a: unknown[]) => findUserById(...a),
  LOGIN_ALLOWED_STATUSES: [0, 1, 2],
}))

import { clearCache } from '~/server/cache'
import { isUserStillAllowed } from './user-check'

describe('isUserStillAllowed', () => {
  beforeEach(() => {
    clearCache()
    findUserById.mockReset()
  })

  it('allows a user whose status may log in', async () => {
    findUserById.mockResolvedValue({ userId: '1', fullName: 'A', userStatus: 1 })
    expect(await isUserStillAllowed('1')).toBe(true)
  })

  it('rejects a user whose status may not log in', async () => {
    findUserById.mockResolvedValue({ userId: '1', fullName: 'A', userStatus: 3 })
    expect(await isUserStillAllowed('1')).toBe(false)
  })

  it('rejects a user that no longer exists', async () => {
    findUserById.mockResolvedValue(null)
    expect(await isUserStillAllowed('1')).toBe(false)
  })

  it('reuses the answer instead of asking the database again', async () => {
    findUserById.mockResolvedValue({ userId: '1', fullName: 'A', userStatus: 1 })
    await isUserStillAllowed('1')
    await isUserStillAllowed('1')
    expect(findUserById).toHaveBeenCalledTimes(1)
  })
})
