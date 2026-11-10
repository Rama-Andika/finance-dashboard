import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'
import { publicErrorMiddleware } from '~/functions/middleware'

const loginSchema = z.object({
  loginId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
})

export const loginFn = createServerFn({ method: 'POST' })
  .middleware([publicErrorMiddleware])
  .validator(loginSchema)
  .handler(async ({ data }) => {
    // dynamic imports keep server modules out of the browser bundle
    const { findLoginCandidate, LOGIN_ALLOWED_STATUSES } = await import('~/server/repo/auth.repo')
    const { safeEqual } = await import('~/server/auth/password')
    const { loginLimiter } = await import('~/server/auth/login-limiter')
    const { getAppSession } = await import('~/server/auth/session')
    const { describeLoginId } = await import('~/server/auth/login-log')
    const { setLogUser } = await import('~/server/logging/log-context')
    const { createLogger } = await import('~/server/log')
    const log = createLogger('auth')

    const ip = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    if (!loginLimiter.hit(`${ip}|${data.loginId.toLowerCase()}`)) {
      log.warn({ ...describeLoginId(data.loginId), reason: 'too-many-attempts' }, 'login failed')
      return { ok: false as const, error: 'tooMany' as const }
    }
    const user = await findLoginCandidate(data.loginId)
    // Always compare (against a dummy value when the user does not exist) so timing is the same.
    const passwordOk = safeEqual(data.password, user?.password ?? '\u0000invalid\u0000')
    const statusOk = user !== null && (LOGIN_ALLOWED_STATUSES as readonly number[]).includes(Number(user.userStatus))
    if (!user || !passwordOk || !statusOk) {
      // Only the log tells the cases apart; the browser gets the SAME answer for every failure (data-model §9.3 item 3).
      const reason = user && passwordOk && !statusOk ? 'inactive-user' : 'invalid-credentials'
      log.warn({ ...describeLoginId(data.loginId), reason }, 'login failed')
      return { ok: false as const, error: 'invalid' as const }
    }
    const session = await getAppSession()
    session.userId = user.userId
    session.name = user.fullName
    await session.save()
    setLogUser(user.userId)
    log.info({}, 'login succeeded')
    return { ok: true as const }
  })

export const logoutFn = createServerFn({ method: 'POST' })
  .middleware([publicErrorMiddleware])
  .handler(async () => {
    const { getAppSession } = await import('~/server/auth/session')
    const { setLogUser } = await import('~/server/logging/log-context')
    const { createLogger } = await import('~/server/log')
    const session = await getAppSession()
    if (session.userId) {
      setLogUser(session.userId)
      createLogger('auth').info({}, 'logout')
    }
    session.destroy()
    return { ok: true as const }
  })

export const getCurrentUserFn = createServerFn({ method: 'GET' })
  .middleware([publicErrorMiddleware])
  .handler(async () => {
    const { getAppSession } = await import('~/server/auth/session')
    const { setLogUser } = await import('~/server/logging/log-context')
    const session = await getAppSession()
    if (!session.userId) return null
    setLogUser(session.userId)
    return { userId: session.userId, name: session.name ?? '' }
  })
