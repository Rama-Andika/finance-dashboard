import { z } from 'zod'

const FALLBACK = '/summary'

/** True only for an internal path such as `/profit-loss?preset=ytd`: no scheme, no `//host`, no backslashes. */
export function isSafeRedirect(value: string): boolean {
  return (
    value.startsWith('/') &&
    !value.startsWith('//') &&
    !value.includes('\\') &&
    !Array.from(value).some((c) => c.charCodeAt(0) < 32) &&
    !value.startsWith('/login')
  )
}

export const safeRedirectSchema = z
  .string()
  .max(4000)
  .transform((v) => (isSafeRedirect(v) ? v : FALLBACK))
  .catch(FALLBACK)
