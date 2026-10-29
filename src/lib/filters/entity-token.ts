import type { Entity, Id } from '~/lib/finance/types'

export function parseEntityToken(
  token: string,
  entities: Entity[],
): { locationIds: Id[] | 'all'; unknownCodes: string[] } {
  if (!token || token === 'all') {
    return { locationIds: 'all', unknownCodes: [] }
  }

  const codes = token
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean)

  if (codes.length === 0) {
    return { locationIds: 'all', unknownCodes: [] }
  }

  const codeToEntity = new Map<string, Entity>()
  for (const e of entities) {
    codeToEntity.set(e.code.toLowerCase(), e)
  }

  const locationIds: Id[] = []
  const unknownCodes: string[] = []

  for (const c of codes) {
    const found = codeToEntity.get(c.toLowerCase())
    if (found) {
      if (!locationIds.includes(found.locationId)) {
        locationIds.push(found.locationId)
      }
    } else {
      unknownCodes.push(c)
    }
  }

  // If all codes are unknown, fallback to 'all'
  if (locationIds.length === 0) {
    return { locationIds: 'all', unknownCodes }
  }

  // If all entities are selected and no unknown codes, return 'all'
  if (locationIds.length === entities.length && unknownCodes.length === 0) {
    return { locationIds: 'all', unknownCodes: [] }
  }

  return { locationIds, unknownCodes }
}

export function serializeEntityToken(selected: Id[], entities: Entity[]): string {
  if (!selected || selected.length === 0 || selected.length === entities.length) {
    return 'all'
  }
  const entityMap = new Map<Id, string>()
  for (const e of entities) {
    entityMap.set(e.locationId, e.code)
  }

  const codes = selected
    .map((id) => entityMap.get(id))
    .filter((code): code is string => Boolean(code))

  return codes.length > 0 ? codes.join(',') : 'all'
}
