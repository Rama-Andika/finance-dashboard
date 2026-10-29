import { createMiddleware } from '@tanstack/react-start'

/** Required on ALL server functions except login/logout/getCurrentUser/prefs (G31). */
export const authMiddleware = createMiddleware({ type: 'function' }).server(async ({ next }) => {
  const { getAppSession } = await import('~/server/session')
  const session = await getAppSession()
  if (!session.userId) throw new Error('UNAUTHORIZED')
  return next({ context: { userId: session.userId } })
})
