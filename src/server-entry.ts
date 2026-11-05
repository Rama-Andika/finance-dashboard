import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { createLogger, errorText } from '~/server/log'

// Start the snapshot refresh when the server process starts, not on the first signed-in request.
// ensureDashScheduler() can be called again safely: the first signed-in request still does so as a safety net.
void import('~/server/dash/scheduler')
  .then((m) => m.ensureDashScheduler())
  .catch((error: unknown) => createLogger('boot').error(`scheduler could not be started: ${errorText(error)}`))

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request)
  },
})
