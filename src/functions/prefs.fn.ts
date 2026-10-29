import { createServerFn } from '@tanstack/react-start'
import { getCookie, setCookie } from '@tanstack/react-start/server'
import { z } from 'zod'

export const prefsSchema = z.object({
  theme: z.enum(['light', 'dark']),
  lang: z.enum(['en', 'id']),
})
export type Prefs = z.infer<typeof prefsSchema>

const ONE_YEAR = 60 * 60 * 24 * 365
const cookieOpts = { path: '/', sameSite: 'lax', httpOnly: true, maxAge: ONE_YEAR } as const

export const getPrefsFn = createServerFn({ method: 'GET' }).handler(async (): Promise<Prefs> => {
  const theme = getCookie('nr_theme') === 'dark' ? 'dark' : 'light'
  const lang = getCookie('nr_lang') === 'id' ? 'id' : 'en'
  return { theme, lang }
})

export const setPrefsFn = createServerFn({ method: 'POST' })
  .validator((d: unknown) => prefsSchema.partial().parse(d))
  .handler(async ({ data }) => {
    if (data.theme) setCookie('nr_theme', data.theme, cookieOpts)
    if (data.lang) setCookie('nr_lang', data.lang, cookieOpts)
    return { ok: true as const }
  })
