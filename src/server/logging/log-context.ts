import { AsyncLocalStorage } from 'node:async_hooks'

/** What every log line written while a request or a background job runs carries along. */
export type LogContext = {
  reqId?: string
  /** Set by the auth step once the signed-in user is known */
  userId?: string
  jobId?: string
  /** For a job started by a request ("Refresh now"): the id of that request */
  parentReqId?: string
  /** The X-Request-Id sent by a proxy in front of the app, when it has the expected shape */
  upstreamId?: string
  /** Names of the server functions called during this request (collected for the access line, not added to every line) */
  fns?: string[]
}

const MAX_FNS = 12

const storage = new AsyncLocalStorage<LogContext>()

/** Runs `work` with a fresh context. Anything it starts (promises, timers) keeps seeing that context. */
export function runWithLogContext<T>(context: LogContext, work: () => T): T {
  return storage.run(context, work)
}

export function getLogContext(): LogContext | undefined {
  return storage.getStore()
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.reqId
}

/** Remembers who the request belongs to; a no-op outside a request. */
export function setLogUser(userId: string): void {
  const store = storage.getStore()
  if (store) store.userId = userId
}

/** Remembers that a server function ran in this request (each name once, at most 12). */
export function noteServerFn(name: string): void {
  const store = storage.getStore()
  if (!store) return
  const fns = (store.fns ??= [])
  if (fns.length < MAX_FNS && !fns.includes(name)) fns.push(name)
}
