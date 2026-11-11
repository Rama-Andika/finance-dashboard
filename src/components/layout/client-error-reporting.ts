import { reportClientErrorFn } from '~/functions/client-error.fn'
import { stripBasePath } from '~/lib/core/base-path'
import { createClientErrorReporter, type ClientErrorReporter } from '~/lib/client-errors/client-error-reporter'

let reporter: ClientErrorReporter | null = null

/** The one reporter of this page load; it counts and de-duplicates what it has sent. */
export function getClientErrorReporter(): ClientErrorReporter {
  reporter ??= createClientErrorReporter((report) => reportClientErrorFn({ data: report }))
  return reporter
}

/** Script errors that are noise, not bugs: the browser's own layout loop warning and errors of other origins without detail. */
const IGNORED_MESSAGES = ['ResizeObserver loop', 'Script error.']

/**
 * Reports errors that no component caught: a script error, and a promise that was rejected and never handled.
 * Call it once, in the browser; the answer is the function that removes the listeners again.
 */
export function installWindowErrorReporting(): () => void {
  const context = (origin: 'window' | 'promise') =>
    ({ origin, route: stripBasePath(window.location.pathname), userAgent: navigator.userAgent }) as const

  const onError = (event: ErrorEvent) => {
    if (IGNORED_MESSAGES.some((text) => event.message.startsWith(text))) return
    void getClientErrorReporter().report(event.error ?? event.message, context('window'))
  }
  const onRejection = (event: PromiseRejectionEvent) => {
    void getClientErrorReporter().report(event.reason, context('promise'))
  }

  window.addEventListener('error', onError)
  window.addEventListener('unhandledrejection', onRejection)
  return () => {
    window.removeEventListener('error', onError)
    window.removeEventListener('unhandledrejection', onRejection)
  }
}
