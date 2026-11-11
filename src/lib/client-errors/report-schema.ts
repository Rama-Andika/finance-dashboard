import { z } from 'zod'

/**
 * What the browser sends when something broke on the page. The length limits keep one report small (about 15 KB at most);
 * the browser cuts its texts to the same limits before sending. Shared by the browser and the server function.
 */
export const CLIENT_ERROR_LIMITS = {
  name: 100,
  message: 2000,
  stack: 8000,
  componentStack: 4000,
  route: 200,
  userAgent: 300,
} as const

export const clientErrorSchema = z.object({
  /** render = a React component threw; window = an uncaught script error; promise = an unhandled rejection */
  origin: z.enum(['render', 'window', 'promise']),
  name: z.string().max(CLIENT_ERROR_LIMITS.name),
  message: z.string().max(CLIENT_ERROR_LIMITS.message),
  stack: z.string().max(CLIENT_ERROR_LIMITS.stack).optional(),
  componentStack: z.string().max(CLIENT_ERROR_LIMITS.componentStack).optional(),
  route: z.string().max(CLIENT_ERROR_LIMITS.route),
  userAgent: z.string().max(CLIENT_ERROR_LIMITS.userAgent).optional(),
})

export type ClientErrorReport = z.infer<typeof clientErrorSchema>
