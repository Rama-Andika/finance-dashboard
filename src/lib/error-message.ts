/**
 * Maps an error from a server function to an i18n key. The raw message is never shown:
 * only known codes are recognised, anything else gets the generic text.
 */
export function errorMessageKey(error: unknown, fallbackKey: string): string {
  if (error instanceof Error && error.message === 'UNAUTHORIZED') return 'metric.sessionExpired'
  return fallbackKey
}
