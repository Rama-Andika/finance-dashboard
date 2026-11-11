import { useEffect, useState } from 'react'
import { useRouterState } from '@tanstack/react-router'
import { getClientErrorReporter } from '~/components/layout/client-error-reporting'
import { errorReference } from '~/lib/error-message'

/**
 * The reference code to show for an error. An error from a server function already carries the request id the server
 * logged it under. An error that happened only in the browser (a component that threw) is reported to the server once,
 * and the id the server answers with is the code. Null while that is on its way, or when no code could be had.
 */
export function useErrorReference(error: unknown): string | null {
  const known = errorReference(error)
  const pathname = useRouterState({ select: (state) => state.location.pathname })
  const [reported, setReported] = useState<string | null>(null)

  useEffect(() => {
    if (known) return
    let cancelled = false
    void getClientErrorReporter()
      .report(error, { origin: 'render', route: pathname, userAgent: navigator.userAgent })
      .then((reference) => {
        if (!cancelled) setReported(reference)
      })
    return () => {
      cancelled = true
    }
  }, [error, known, pathname])

  return known ?? reported
}
