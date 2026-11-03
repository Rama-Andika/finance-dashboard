import type { Id } from './types'

/** The periods of the global filter, in the order they were given. */
export function activePeriodsOf<P extends { periodeId: Id }>(periods: readonly P[], periodIds: readonly Id[]): P[] {
  const wanted = new Set(periodIds)
  return periods.filter((p) => wanted.has(p.periodeId))
}

/** The entities of the global filter: all of them for `'all'`, otherwise the selected locations. */
export function entitiesOfFilter<E extends { locationId: Id }>(
  entities: readonly E[],
  locationIds: readonly Id[] | 'all',
): E[] {
  if (locationIds === 'all') return [...entities]
  const wanted = new Set(locationIds)
  return entities.filter((e) => wanted.has(e.locationId))
}
