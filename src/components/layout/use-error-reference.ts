import { errorReference } from '~/lib/error-message'

/** The reference code to show for an error: the request id the server put on it, or null when it has none. */
export function useErrorReference(error: unknown): string | null {
  return errorReference(error)
}
