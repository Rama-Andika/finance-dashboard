import { describe, expect, it } from 'vitest'
import { glTablesOf, groupPeriodsByTable } from './gl-tables'
import type { Period } from '~/lib/finance/types'

describe('glTablesOf', () => {
  it('returns gl and gl_detail for main table', () => {
    expect(glTablesOf('gl')).toEqual({ gl: 'gl', glDetail: 'gl_detail' })
  })

  it('returns dynamic gl and gl_detail for archived years', () => {
    expect(glTablesOf('gl_2015')).toEqual({ gl: 'gl_2015', glDetail: 'gl_detail_2015' })
    expect(glTablesOf('gl_2024')).toEqual({ gl: 'gl_2024', glDetail: 'gl_detail_2024' })
  })

  it('throws for invalid or malicious table names', () => {
    expect(() => glTablesOf('gl; DROP TABLE x')).toThrow()
    expect(() => glTablesOf('users')).toThrow()
    expect(() => glTablesOf('')).toThrow()
    expect(() => glTablesOf('gl_1999')).toThrow()
    expect(() => glTablesOf('gl_2100')).toThrow()
    expect(() => glTablesOf('gl_abc')).toThrow()
  })
})

describe('groupPeriodsByTable', () => {
  it('groups periods properly by tableName', () => {
    const periods: Period[] = [
      {
        periodeId: '1',
        name: 'Jan 2015',
        startDate: '2015-01-01',
        endDate: '2015-01-31',
        status: 'Closed',
        type: 0,
        tableName: 'gl_2015',
      },
      {
        periodeId: '2',
        name: 'Feb 2015',
        startDate: '2015-02-01',
        endDate: '2015-02-28',
        status: 'Closed',
        type: 0,
        tableName: 'gl_2015',
      },
      {
        periodeId: '3',
        name: 'Jan 2026',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        status: 'Open',
        type: 0,
        tableName: 'gl',
      },
    ]

    const grouped = groupPeriodsByTable(periods)
    expect(grouped.size).toBe(2)
    expect(grouped.get('gl_2015')?.map((p) => p.periodeId)).toEqual(['1', '2'])
    expect(grouped.get('gl')?.map((p) => p.periodeId)).toEqual(['3'])
  })

  it('throws error if any period has invalid tableName', () => {
    const badPeriods: Period[] = [
      {
        periodeId: '99',
        name: 'Hacked',
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        status: 'Open',
        type: 0,
        tableName: 'invalids',
      },
    ]
    expect(() => groupPeriodsByTable(badPeriods)).toThrow()
  })
})
