import '@tanstack/react-start/server-only'
import { memo } from '~/server/cache'
import { findUserById, LOGIN_ALLOWED_STATUSES } from '~/server/repo/auth.repo'

/** How long a "user is still allowed to log in" answer is reused before asking the DB again. */
export const USER_RECHECK_MS = 60_000

/** True when the ERP user still exists and has a status that may log in. A deactivated user loses access within a minute. */
export async function isUserStillAllowed(userId: string): Promise<boolean> {
  return memo(`auth:user:${userId}`, USER_RECHECK_MS, async () => {
    const user = await findUserById(userId)
    return user !== null && (LOGIN_ALLOWED_STATUSES as readonly number[]).includes(Number(user.userStatus))
  })
}
