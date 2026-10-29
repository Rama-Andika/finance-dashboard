import { describe, expect, it } from 'vitest'
import { describeEntityToken, parseEntityToken, serializeEntityToken } from './entity-token'
import type { Entity } from '~/lib/core/types'

// Real location ids are 18+ digit strings; they must stay strings.
const mockEntities: Entity[] = [
  { locationId: '5044044740741852371', code: '127', name: 'Store 127', isActive: true, segmentDetailIds: ['1'] },
  { locationId: '5044044740741852372', code: 'B02', name: 'Store B02', isActive: true, segmentDetailIds: ['2'] },
  { locationId: '5044044740741852373', code: 'C03', name: 'Store C03', isActive: false, segmentDetailIds: ['3'] },
]
const [A, B, C] = mockEntities.map((e) => e.locationId) as [string, string, string]

describe('parseEntityToken', () => {
  it('parses "all", empty and blank tokens as all', () => {
    for (const token of ['all', '', ' , ']) {
      expect(parseEntityToken(token, mockEntities)).toEqual({ locationIds: 'all', unknownIds: [] })
    }
  })

  it('reads a single location id', () => {
    expect(parseEntityToken(A, mockEntities)).toEqual({ locationIds: [A], unknownIds: [] })
  })

  it('reads comma-separated location ids, without duplicates', () => {
    expect(parseEntityToken(`${A}, ${B},${A}`, mockEntities)).toEqual({ locationIds: [A, B], unknownIds: [] })
  })

  it('no longer reads entity codes: "127" is not a location id', () => {
    expect(parseEntityToken('127', mockEntities)).toEqual({ locationIds: 'all', unknownIds: ['127'] })
  })

  it('isolates unknown ids and returns the matching location ids', () => {
    expect(parseEntityToken(`${A},999`, mockEntities)).toEqual({ locationIds: [A], unknownIds: ['999'] })
  })

  it('falls back to all when every id is unknown', () => {
    expect(parseEntityToken('1,2', mockEntities)).toEqual({ locationIds: 'all', unknownIds: ['1', '2'] })
  })

  it('returns "all" if all entities are selected without unknown ids', () => {
    expect(parseEntityToken(`${A},${B},${C}`, mockEntities)).toEqual({ locationIds: 'all', unknownIds: [] })
  })
})

describe('serializeEntityToken', () => {
  it('serializes all entities selected, or none, to "all"', () => {
    expect(serializeEntityToken([A, B, C], mockEntities)).toBe('all')
    expect(serializeEntityToken([], mockEntities)).toBe('all')
  })

  it('serializes a partial selection to comma-separated location ids', () => {
    expect(serializeEntityToken([A, B], mockEntities)).toBe(`${A},${B}`)
    expect(serializeEntityToken([C], mockEntities)).toBe(C)
  })

  it('drops ids that are not entities', () => {
    expect(serializeEntityToken([A, '999'], mockEntities)).toBe(A)
  })

  it('round-trips through parseEntityToken', () => {
    expect(parseEntityToken(serializeEntityToken([B, C], mockEntities), mockEntities).locationIds).toEqual([B, C])
  })
})

describe('describeEntityToken', () => {
  const options = mockEntities.map((e) => ({ id: e.locationId, code: e.code }))

  it('shows the codes of a few entities', () => {
    expect(describeEntityToken(`${A},${C}`, options)).toEqual({ kind: 'codes', codes: ['127', 'C03'] })
  })

  it('shows only a count when many entities are selected', () => {
    expect(describeEntityToken(`${A},${B},${C}`, options, 2)).toEqual({ kind: 'count', count: 3 })
  })

  it('treats all / unknown tokens as all', () => {
    expect(describeEntityToken('all', options)).toEqual({ kind: 'all' })
    expect(describeEntityToken('999', options)).toEqual({ kind: 'all' })
  })
})
