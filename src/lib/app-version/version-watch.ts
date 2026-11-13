import { APP_VERSION_HEADER } from './app-version'

/**
 * True when the server runs another version than the page. Deliberately "different", not "newer": after a rollback the
 * server is older than the tabs that are still open, and those tabs must reload too. No header (a proxy removed it) is
 * no reason to warn.
 */
export function isVersionMismatch(clientVersion: string, serverVersion: string | null): boolean {
  return serverVersion !== null && serverVersion !== '' && serverVersion !== clientVersion
}

export type VersionStore = {
  /** Called with the version header of every server function response (null when the response has none). */
  report: (serverVersion: string | null) => void
  subscribe: (listener: () => void) => () => void
  /** True while the last version the server reported differs from the page's own. For useSyncExternalStore. */
  getSnapshot: () => boolean
}

/** Remembers whether the server's version differs from `clientVersion`, and tells listeners when that changes. */
export function createVersionStore(clientVersion: string): VersionStore {
  let mismatch = false
  const listeners = new Set<() => void>()
  return {
    report(serverVersion) {
      const next = isVersionMismatch(clientVersion, serverVersion)
      if (next === mismatch) return
      mismatch = next
      for (const listener of listeners) listener()
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => mismatch,
  }
}

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>

/** A fetch that passes every response's version header to `report`, and returns the response untouched. */
export function withVersionReport(base: FetchLike, report: (serverVersion: string | null) => void): FetchLike {
  return async (input, init) => {
    const response = await base(input, init)
    report(response.headers.get(APP_VERSION_HEADER))
    return response
  }
}
