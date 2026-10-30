import { describe, expect, it } from 'vitest'
import type { Entity } from './types'
import { buildEntityOwners, countEntitiesInScope, ownerNameOfLocation, ownerNameOfSegment } from './entity-owner'

const entity = (
  locationId: string,
  name: string,
  segmentDetailIds: string[],
  code = locationId.toUpperCase(),
): Entity => ({
  locationId,
  code,
  name,
  isActive: true,
  segmentDetailIds,
})

const entities = [entity('locA', 'Store A', ['sA1', 'sA2']), entity('locB', 'Store B', ['sB'])]

describe('buildEntityOwners', () => {
  it('maps a location id and every segment detail id of an entity to its name', () => {
    const owners = buildEntityOwners(entities)
    expect(ownerNameOfLocation(owners, 'locA')).toBe('Store A')
    expect(ownerNameOfSegment(owners, 'sA1')).toBe('Store A')
    expect(ownerNameOfSegment(owners, 'sA2')).toBe('Store A')
    expect(ownerNameOfSegment(owners, 'sB')).toBe('Store B')
  })

  it('falls back to the entity code when the name is empty', () => {
    const owners = buildEntityOwners([entity('locC', '', ['sC'], 'C')])
    expect(ownerNameOfLocation(owners, 'locC')).toBe('C')
    expect(ownerNameOfSegment(owners, 'sC')).toBe('C')
  })
})

describe('ownerNameOfLocation', () => {
  const owners = buildEntityOwners(entities)

  it('returns null for an empty, missing or unknown location', () => {
    expect(ownerNameOfLocation(owners, '')).toBeNull()
    expect(ownerNameOfLocation(owners, null)).toBeNull()
    expect(ownerNameOfLocation(owners, undefined)).toBeNull()
    expect(ownerNameOfLocation(owners, 'locZ')).toBeNull()
  })
})

describe('ownerNameOfSegment', () => {
  const owners = buildEntityOwners(entities)

  it('returns null for an empty, "0" (no segment) or unknown segment detail', () => {
    expect(ownerNameOfSegment(owners, '')).toBeNull()
    expect(ownerNameOfSegment(owners, '0')).toBeNull()
    expect(ownerNameOfSegment(owners, null)).toBeNull()
    expect(ownerNameOfSegment(owners, 'sZ')).toBeNull()
  })
})

describe('countEntitiesInScope', () => {
  it('counts every entity for "all"', () => {
    expect(countEntitiesInScope('all', entities)).toBe(2)
  })

  it('counts entities, not segment ids: two segment ids of one entity are one entity', () => {
    expect(countEntitiesInScope(['sA1', 'sA2'], entities)).toBe(1)
  })

  it('counts the entities that own at least one of the segment ids', () => {
    expect(countEntitiesInScope(['sA1', 'sB'], entities)).toBe(2)
  })

  it('ignores unknown segment ids and an empty list', () => {
    expect(countEntitiesInScope(['sZ'], entities)).toBe(0)
    expect(countEntitiesInScope([], entities)).toBe(0)
  })
})
