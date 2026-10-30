import type { Entity, Id } from './types'

/** Name lookups from a location id or a segment detail id to the entity that owns it. */
export type EntityOwners = {
  byLocationId: ReadonlyMap<Id, string>
  bySegmentDetailId: ReadonlyMap<Id, string>
}

/** Display name of an entity: its name, or its code when the name is empty. */
function displayName(entity: Entity): string {
  return entity.name || entity.code
}

export function buildEntityOwners(entities: readonly Entity[]): EntityOwners {
  const byLocationId = new Map<Id, string>()
  const bySegmentDetailId = new Map<Id, string>()
  for (const entity of entities) {
    const name = displayName(entity)
    byLocationId.set(entity.locationId, name)
    for (const segmentDetailId of entity.segmentDetailIds) bySegmentDetailId.set(segmentDetailId, name)
  }
  return { byLocationId, bySegmentDetailId }
}

/** Name of the entity that owns a location; null when the location is empty or unknown ("no entity"). */
export function ownerNameOfLocation(owners: EntityOwners, locationId: Id | null | undefined): string | null {
  if (!locationId) return null
  return owners.byLocationId.get(locationId) ?? null
}

/** Name of the entity that owns a segment detail; null when the segment is empty, "0" or unknown. */
export function ownerNameOfSegment(owners: EntityOwners, segmentDetailId: Id | null | undefined): string | null {
  if (!segmentDetailId) return null
  return owners.bySegmentDetailId.get(segmentDetailId) ?? null
}

/** How many entities a segment-detail filter covers ('all' = every entity). */
export function countEntitiesInScope(segIds: readonly Id[] | 'all', entities: readonly Entity[]): number {
  if (segIds === 'all') return entities.length
  const wanted = new Set(segIds)
  return entities.filter((entity) => entity.segmentDetailIds.some((id) => wanted.has(id))).length
}

/** What a table needs to caption its rows with the owning entity: whether to show it, and the row field to add. */
export type EntityCaptions = {
  /** True when more than one entity is in scope; only then do rows name their owner. */
  show: boolean
  /** `{ entityName }` for a row owned by a location ({} when captions are off); null name = no known entity. */
  fieldsOfLocation(locationId: Id | null | undefined): { entityName?: string | null }
  /** The same for a row owned by an entity segment detail. */
  fieldsOfSegment(segmentDetailId: Id | null | undefined): { entityName?: string | null }
}

export function buildEntityCaptions(entities: readonly Entity[], entitiesInScope: number): EntityCaptions {
  const show = entitiesInScope > 1
  const owners = buildEntityOwners(entities)
  return {
    show,
    fieldsOfLocation: (locationId) => (show ? { entityName: ownerNameOfLocation(owners, locationId) } : {}),
    fieldsOfSegment: (segmentDetailId) => (show ? { entityName: ownerNameOfSegment(owners, segmentDetailId) } : {}),
  }
}
