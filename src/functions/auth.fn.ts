import { createServerFn } from '@tanstack/react-start'
import { getRequestIP } from '@tanstack/react-start/server'
import { z } from 'zod'

const loginSchema = z.object({
  loginId: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(128),
})

export const loginFn = createServerFn({ method: 'POST' })
  .validator(loginSchema)
  .handler(async ({ data }) => {
    // dynamic imports keep server modules out of the browser bundle
    const { findLoginCandidate, LOGIN_ALLOWED_STATUSES } = await import('~/server/repo/auth.repo')
    const { safeEqual } = await import('~/server/password')
    const { loginLimiter } = await import('~/server/login-limiter')
    const { getAppSession } = await import('~/server/session')

    const ip = getRequestIP({ xForwardedFor: true }) ?? 'unknown'
    if (!loginLimiter.hit(`${ip}|${data.loginId.toLowerCase()}`)) {
      return { ok: false as const, error: 'tooMany' as const }
    }
    const user = await findLoginCandidate(data.loginId)
    // Always compare (against a dummy value when the user does not exist) so timing is the same.
    const passwordOk = safeEqual(data.password, user?.password ?? '\u0000invalid\u0000')
    const statusOk = user !== null && (LOGIN_ALLOWED_STATUSES as readonly number[]).includes(Number(user.userStatus))
    if (!user || !passwordOk || !statusOk) {
      return { ok: false as const, error: 'invalid' as const } // SAME error for every failure (data-model §9.3 item 3)
    }
    const session = await getAppSession()
    session.userId = user.userId
    session.name = user.fullName
    await session.save()
    return { ok: true as const }
  })

export const logoutFn = createServerFn({ method: 'POST' }).handler(async () => {
  const { getAppSession } = await import('~/server/session')
  const session = await getAppSession()
  session.destroy()
  return { ok: true as const }
})

export const getCurrentUserFn = createServerFn({ method: 'GET' }).handler(async () => {
  const { getAppSession } = await import('~/server/session')
  const session = await getAppSession()
  if (!session.userId) return null
  return { userId: session.userId, name: session.name ?? '' }
})
