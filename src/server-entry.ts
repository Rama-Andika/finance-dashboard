import handler, { createServerEntry } from '@tanstack/react-start/server-entry'
import { createLogger } from '~/server/log'
import { startFileLogging } from '~/server/logging/file-destination'
import { installProcessHandlers } from '~/server/logging/process-handlers'

// The daily log file (LOG_TO_FILE=1) and the handlers for errors nobody caught. Both are safe to start twice (hot reload).
const fileLogging = startFileLogging()
installProcessHandlers({ flush: () => fileLogging?.flush(), exitOnFatal: process.env.NODE_ENV === 'production' })
createLogger('boot').info({}, 'server started')

// Start the snapshot refresh when the server process starts, not on the first signed-in request.
// ensureDashScheduler() can be called again safely: the first signed-in request still does so as a safety net.
void import('~/server/dash/scheduler')
  .then((m) => m.ensureDashScheduler())
  .catch((error: unknown) => createLogger('boot').error({ err: error }, 'scheduler could not be started'))

export default createServerEntry({
  fetch(request) {
    return handler.fetch(request)
  },
})
