import { createServerFn } from '@tanstack/react-start'
import { authMiddleware } from '~/functions/middleware'
import { clientErrorSchema } from '~/lib/client-errors/report-schema'
import { recordClientError, type ClientErrorResult } from '~/server/services/client-error.service'

export type { ClientErrorResult }

/** The browser reports an error that happened on the page. Signed-in users only; the report is written to the log. */
export const reportClientErrorFn = createServerFn({ method: 'POST' })
  .middleware([authMiddleware])
  .validator(clientErrorSchema)
  .handler(async ({ data, context }): Promise<ClientErrorResult> => recordClientError(context.userId, data))
