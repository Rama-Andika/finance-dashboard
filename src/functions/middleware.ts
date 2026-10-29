import { createMiddleware } from '@tanstack/react-start'

/** How long a "user is still allowed to log in" answer is reused before asking the DB again. */
const USER_RECHECK_MS = 60_000

/** Required on ALL server functions except login/logout/getCurrentUser/prefs (G31). */
export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { getAppSession } = await import('~/server/auth/session')
  const { memo } = await import('~/server/cache')
  const { findUserById, LOGIN_ALLOWED_STATUSES } = await import('~/server/repo/auth.repo')

  const session = await getAppSession()
  if (!session.userId) throw new Error('UNAUTHORIZED')

  // A user deactivated in the ERP loses access within a minute, not after the 8-hour session.
  const userId = session.userId
  const stillAllowed = await memo(`auth:user:${userId}`, USER_RECHECK_MS, async () => {
    const user = await findUserById(userId)
    return user !== null && (LOGIN_ALLOWED_STATUSES as readonly number[]).includes(Number(user.userStatus))
  })
  if (!stillAllowed) {
    session.destroy()
    throw new Error('UNAUTHORIZED')
  }

  // Start the background refresh of the snapshot tables once per server process (no-op afterwards).
  void import('~/server/dash/scheduler').then((m) => m.ensureDashScheduler()).catch(() => {})

  // Errors from the handler or its validator may carry SQL text and parameters; the browser only gets a code.
  const { toPublicError } = await import('~/server/public-error')
  try {
    return await next({ context: { userId } })
  } catch (error) {
    throw toPublicError(error)
  }
})
