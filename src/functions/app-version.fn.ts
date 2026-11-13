import { createServerFn } from '@tanstack/react-start'
import { publicErrorMiddleware } from '~/functions/middleware'
import { APP_VERSION } from '~/lib/app-version/app-version'

/**
 * The version of the running server. It needs no sign-in (the version is public in /health too), so it uses
 * publicErrorMiddleware alone. The browser calls it to make a round trip when a tab becomes visible again; what matters
 * is the X-App-Version header of the response (src/start.ts), and the answer repeats it.
 */
export const getAppVersionFn = createServerFn({ method: 'GET' })
  .middleware([publicErrorMiddleware])
  .handler(async (): Promise<{ version: string }> => ({ version: APP_VERSION }))
