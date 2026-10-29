import type { Entity, Id } from '~/lib/core/types'

/**
 * The `entity` URL parameter: `all`, or comma-separated location ids (`pos_location.location_id`),
 * for example `?entity=5044044740741852371` or `?entity=<id1>,<id2>`.
 */
export function parseEntityToken(
  token: string,
  entities: Entity[],
): { locationIds: Id[] | 'all'; unknownIds: string[] } {
  if (!token || token === 'all') {
    return { locationIds: 'all', unknownIds: [] }
  }

  const ids = token
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)

  if (ids.length === 0) {
    return { locationIds: 'all', unknownIds: [] }
  }

  const known = new Set(entities.map((e) => e.locationId))

  const locationIds: Id[] = []
  const unknownIds: string[] = []

  for (const id of ids) {
    if (known.has(id)) {
      if (!locationIds.includes(id)) locationIds.push(id)
    } else {
      unknownIds.push(id)
    }
  }

  // If all ids are unknown, fallback to 'all'
  if (locationIds.length === 0) {
    return { locationIds: 'all', unknownIds }
  }

  // If all entities are selected and no unknown ids, return 'all'
  if (locationIds.length === entities.length && unknownIds.length === 0) {
    return { locationIds: 'all', unknownIds: [] }
  }

  return { locationIds, unknownIds }
}

export function serializeEntityToken(selected: Id[], entities: Entity[]): string {
  if (!selected || selected.length === 0 || selected.length === entities.length) {
    return 'all'
  }
  const known = new Set(entities.map((e) => e.locationId))
  const ids = selected.filter((id) => known.has(id))
  return ids.length > 0 ? ids.join(',') : 'all'
}

/** Short names for the entity token (for print headers): the entity codes, or "N entities" when there are many. */
export function describeEntityToken(
  token: string,
  entities: ReadonlyArray<{ id: Id; code: string }>,
  maxCodes = 5,
): { kind: 'all' } | { kind: 'codes'; codes: string[] } | { kind: 'count'; count: number } {
  if (!token || token === 'all') return { kind: 'all' }
  const byId = new Map(entities.map((e) => [e.id, e.code]))
  const codes = token
    .split(',')
    .map((id) => byId.get(id.trim()))
    .filter((code): code is string => Boolean(code))
  if (codes.length === 0) return { kind: 'all' }
  return codes.length <= maxCodes ? { kind: 'codes', codes } : { kind: 'count', count: codes.length }
}
