import { createMiddleware } from '@tanstack/react-start'
import { dashLog } from '~/server/dash/log'
import { errorText } from '~/server/log'

/** Required on ALL server functions except login/logout/getCurrentUser/prefs (G31). */
export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { getAppSession } = await import('~/server/auth/session')
  const { isUserStillAllowed } = await import('~/server/auth/user-check')

  const session = await getAppSession()
  if (!session.userId) throw new Error('UNAUTHORIZED')

  // A user deactivated in the ERP loses access within a minute, not after the 8-hour session.
  const userId = session.userId
  if (!(await isUserStillAllowed(userId))) {
    session.destroy()
    throw new Error('UNAUTHORIZED')
  }

  // Start the background refresh of the snapshot tables once per server process (no-op afterwards).
  void import('~/server/dash/scheduler')
    .then((m) => m.ensureDashScheduler())
    .catch((error) => dashLog.error(`scheduler could not be loaded: ${errorText(error)}`))

  // Errors from the handler or its validator may carry SQL text and parameters; the browser only gets a code.
  const { toPublicError } = await import('~/server/public-error')
  try {
    return await next({ context: { userId } })
  } catch (error) {
    throw toPublicError(error)
  }
})
