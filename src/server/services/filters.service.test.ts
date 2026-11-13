import { describe, expect, it, vi } from 'vitest'
import { PRESETS } from '~/lib/filters/search-schema'
import type { Period } from '~/lib/core/types'

const period = (periodeId: string, month: string, type: Period['type'], status: Period['status']): Period => ({
  periodeId,
  name: month,
  startDate: `${month}-01`,
  endDate: `${month}-28`,
  status,
  type,
  tableName: 'gl',
})

const periods: Period[] = [
  period('p8', '2026-08', 0, 'Closed'),
  period('p9', '2026-09', 0, 'Closed'),
  period('p10', '2026-10', 0, 'Open'),
  period('p13', '2026-09', 1, 'Closed'), // period 13 shares the month of a regular period and must not count as one
]
const entities = [
  { locationId: 'locA', code: 'A', name: 'Store A', isActive: true, segmentDetailIds: ['sA'] },
  { locationId: 'locB', code: 'B', name: 'Store B', isActive: false, segmentDetailIds: ['sB'] },
]

vi.mock('~/server/context', () => ({
  appToday: () => '2026-10-15',
  getCachedEntities: async () => ({ entities }),
  getCachedPeriods: async () => periods,
}))

const { getFilterOptions } = await import('./filters.service')

describe('getFilterOptions', () => {
  it('lists the entities with their location id as id', async () => {
    const options = await getFilterOptions()
    expect(options.entities).toEqual([
      { id: 'locA', code: 'A', name: 'Store A', isActive: true },
      { id: 'locB', code: 'B', name: 'Store B', isActive: false },
    ])
  })

  it('lists the calendar months of the regular periods, newest first, with their status', async () => {
    const options = await getFilterOptions()
    expect(options.months).toEqual([
      { month: '2026-10', status: 'Open' },
      { month: '2026-09', status: 'Closed' },
      { month: '2026-08', status: 'Closed' },
    ])
  })

  it('gives a month hint for every preset', async () => {
    const options = await getFilterOptions()
    expect(options.presets.map((p) => p.preset)).toEqual([...PRESETS])
    for (const hint of options.presets) {
      expect(hint.from).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      expect(hint.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    }
  })

  it('says which day is today', async () => {
    expect((await getFilterOptions()).today).toBe('2026-10-15')
  })
})
