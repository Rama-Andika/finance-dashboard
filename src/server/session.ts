import '@tanstack/react-start/server-only'
import { getIronSession, type CookieStore } from 'iron-session'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { env } from '~/server/env'

export type SessionData = { userId?: string; name?: string }

const EIGHT_HOURS = 8 * 60 * 60

export function getAppSession() {
  const cookieStore: CookieStore = {
    get(name: string) {
      const val = getCookie(name)
      return val !== undefined ? { name, value: val } : undefined
    },
    set(name: string, value: string, cookieOptions) {
      setCookie(name, value, cookieOptions as any)
    },
  }

  return getIronSession<SessionData>(cookieStore, {
    cookieName: 'nr_session',
    password: env.SESSION_SECRET,
    ttl: EIGHT_HOURS,
    cookieOptions: {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
    },
  })
}
