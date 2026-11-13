import { createMiddleware } from '@tanstack/react-start'
import { dashLog } from '~/server/dash/log'

/**
 * Turns every error of a server function into a public one (a code, the request id and no stack trace; the raw error goes
 * to the log under the same id) and remembers which server function ran, for the access line. authMiddleware includes
 * it; the few functions that need no login use it alone.
 */
export const publicErrorMiddleware = createMiddleware({ type: 'function' }).server(async ({ next, serverFnMeta }) => {
  const { noteServerFn } = await import('~/server/logging/log-context')
  noteServerFn(serverFnMeta.name)
  try {
    return await next()
  } catch (error) {
    const { toPublicError } = await import('~/server/public-error')
    throw toPublicError(error, serverFnMeta.name)
  }
})

/** Required on ALL server functions except login/logout/getCurrentUser/prefs/getAppVersion (G31). */
export const authMiddleware = createMiddleware({ type: 'function' })
  .middleware([publicErrorMiddleware])
  .server(async ({ next }) => {
    const { getAppSession } = await import('~/server/auth/session')
    const { isUserStillAllowed } = await import('~/server/auth/user-check')
    const { setLogUser } = await import('~/server/logging/log-context')
    const { createLogger } = await import('~/server/log')

    const session = await getAppSession()
    if (!session.userId) throw new Error('UNAUTHORIZED')

    // A user deactivated in the ERP loses access within a minute, not after the 8-hour session.
    const userId = session.userId
    setLogUser(userId)
    if (!(await isUserStillAllowed(userId))) {
      createLogger('auth').info({}, 'session ended: the user is no longer allowed')
      session.destroy()
      throw new Error('UNAUTHORIZED')
    }

    // Start the background refresh of the snapshot tables once per server process (no-op afterwards).
    void import('~/server/dash/scheduler')
      .then((m) => m.ensureDashScheduler())
      .catch((error: unknown) => dashLog.error({ err: error }, 'scheduler could not be loaded'))

    return next({ context: { userId } })
  })
