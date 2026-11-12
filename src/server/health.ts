import '@tanstack/react-start/server-only'
import { basePath } from '~/lib/core/base-path'
import { createLogger } from '~/server/log'
import { createHealthChecker, healthResponse, isHealthRequest } from './health-core'

const log = createLogger('health')

const check = createHealthChecker({
  version: () => process.env.APP_VERSION ?? '',
  // The pool is loaded here, on the first check: creating it parses the environment, and a wrong setting must show up as
  // a failed health check (the process stays up and the log says why) instead of stopping the server from starting.
  ping: async () => {
    const { pool } = await import('~/server/db/client')
    await pool.query('SELECT 1')
  },
  onFailure: (error) => log.warn({ err: error }, 'health check failed'),
})

/**
 * The answer for GET or HEAD <prefix>/health, or null when the request is for something else.
 * Called before the request logging on purpose: the deploy script asks every few seconds.
 */
export function handleHealthRequest(request: Request): Promise<Response> | null {
  const { pathname } = new URL(request.url)
  if (!isHealthRequest(request.method, pathname, basePath)) return null
  return check().then((result) => healthResponse(result, request.method))
}
