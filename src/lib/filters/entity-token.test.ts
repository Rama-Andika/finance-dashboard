import { describe, expect, it } from 'vitest'
import { parseEntityToken, serializeEntityToken } from './entity-token'
import type { Entity } from '~/lib/finance/types'

const mockEntities: Entity[] = [
  { locationId: '101', code: 'A01', name: 'Store A01', isActive: true, segmentDetailIds: ['1'] },
  { locationId: '102', code: 'B02', name: 'Store B02', isActive: true, segmentDetailIds: ['2'] },
  { locationId: '103', code: 'C03', name: 'Store C03', isActive: false, segmentDetailIds: ['3'] },
]

describe('parseEntityToken', () => {
  it('parses "all" token as all', () => {
    expect(parseEntityToken('all', mockEntities)).toEqual({
      locationIds: 'all',
      unknownCodes: [],
    })
    expect(parseEntityToken('', mockEntities)).toEqual({
      locationIds: 'all',
      unknownCodes: [],
    })
  })

  it('parses valid comma-separated entity codes', () => {
    expect(parseEntityToken('A01,B02', mockEntities)).toEqual({
      locationIds: ['101', '102'],
      unknownCodes: [],
    })
  })

  it('isolates unknown codes and returns matching locationIds', () => {
    expect(parseEntityToken('A01,ZZZ', mockEntities)).toEqual({
      locationIds: ['101'],
      unknownCodes: ['ZZZ'],
    })
  })

  it('falls back to all when all codes are unknown', () => {
    expect(parseEntityToken('UNKNOWN1,UNKNOWN2', mockEntities)).toEqual({
      locationIds: 'all',
      unknownCodes: ['UNKNOWN1', 'UNKNOWN2'],
    })
  })

  it('returns "all" if all entities are selected without unknown codes', () => {
    expect(parseEntityToken('A01,B02,C03', mockEntities)).toEqual({
      locationIds: 'all',
      unknownCodes: [],
    })
  })
})

describe('serializeEntityToken', () => {
  it('serializes all entities selected to "all"', () => {
    expect(serializeEntityToken(['101', '102', '103'], mockEntities)).toBe('all')
    expect(serializeEntityToken([], mockEntities)).toBe('all')
  })

  it('serializes partial selection to comma-separated codes', () => {
    expect(serializeEntityToken(['101', '102'], mockEntities)).toBe('A01,B02')
    expect(serializeEntityToken(['103'], mockEntities)).toBe('C03')
  })
})
