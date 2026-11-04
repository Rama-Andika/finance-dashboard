import '@tanstack/react-start/server-only'
import { clearCache } from '~/server/cache'

/**
 * Forget everything that was derived from closed-period journals. Called after a snapshot period was rebuilt or
 * dropped, because answers cached from its older rows must not be served any more.
 */
export function clearCachesAfterPeriodChange(): void {
  clearCache('dash:gl:built')
  clearCache('dash:cash:built')
  clearCache('periods:all')
  clearCache('cashLines')
  // Also empties the closed-period movement cache.
  clearCache('mv|')
  // Every computed metric may have used the older rows.
  clearCache('metric:')
}
