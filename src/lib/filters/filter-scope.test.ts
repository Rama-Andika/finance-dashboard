import { describe, expect, it } from 'vitest'
import { activePeriodsOf, entitiesOfFilter } from './filter-scope'

describe('activePeriodsOf', () => {
  const periods = [{ periodeId: '1' }, { periodeId: '2' }, { periodeId: '3' }]

  it('keeps the periods of the filter in their own order', () => {
    expect(activePeriodsOf(periods, ['3', '1'])).toEqual([{ periodeId: '1' }, { periodeId: '3' }])
  })

  it('returns nothing when the filter has no periods or none match', () => {
    expect(activePeriodsOf(periods, [])).toEqual([])
    expect(activePeriodsOf(periods, ['9'])).toEqual([])
  })
})

describe('entitiesOfFilter', () => {
  const entities = [{ locationId: 'a' }, { locationId: 'b' }, { locationId: 'c' }]

  it('returns every entity for "all", as a copy', () => {
    const all = entitiesOfFilter(entities, 'all')
    expect(all).toEqual(entities)
    expect(all).not.toBe(entities)
  })

  it('returns only the selected locations', () => {
    expect(entitiesOfFilter(entities, ['c', 'a'])).toEqual([{ locationId: 'a' }, { locationId: 'c' }])
    expect(entitiesOfFilter(entities, [])).toEqual([])
  })
})
