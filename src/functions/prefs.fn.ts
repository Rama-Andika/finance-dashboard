import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'
import { cookieName, cookiePath } from '~/lib/core/base-path'

export const prefsSchema = z.object({
  theme: z.enum(['light', 'dark']),
  lang: z.enum(['en', 'id']),
})
export type Prefs = z.infer<typeof prefsSchema>

const ONE_YEAR = 60 * 60 * 24 * 365

/** `secure` only in production, like the session cookie, so http://localhost keeps working in development. */
async function cookieOptions() {
  const { env } = await import('~/server/env')
  return {
    path: cookiePath,
    sameSite: 'lax',
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    maxAge: ONE_YEAR,
  } as const
}

export const getPrefsFn = createServerFn({ method: 'GET' }).handler(async (): Promise<Prefs> => {
  const theme = getCookie(cookieName('nr_theme')) === 'dark' ? 'dark' : 'light'
  const lang = getCookie(cookieName('nr_lang')) === 'id' ? 'id' : 'en'
  return { theme, lang }
})

export const setPrefsFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) => prefsSchema.partial().parse(d))
  .handler(async ({ data }) => {
    const options = await cookieOptions()
    if (data.theme) setCookie(cookieName('nr_theme'), data.theme, options)
    if (data.lang) setCookie(cookieName('nr_lang'), data.lang, options)
    return { ok: true as const }
  })
