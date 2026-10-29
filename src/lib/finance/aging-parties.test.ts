import { describe, expect, it } from 'vitest'
import { paginate } from '~/lib/table/query'
import { agingPartyComparators, overdueOf, toPartyRow } from './aging-parties'

const buckets = (o: Partial<Record<string, string>>) => ({
  overdue0_30: '0.00', overdue31_60: '0.00', overdue61_90: '0.00', overdue90plus: '0.00',
  due1_30: '0.00', due31_60: '0.00', due61_90: '0.00', due90plus: '0.00', ...o,
}) as ReturnType<typeof Object>

const party = (id: string, name: string, total: string, o: Partial<Record<string, string>> = {}) =>
  toPartyRow({ id, code: id, name, total, buckets: buckets(o) as never })

describe('aging party rows', () => {
  it('sums only the four overdue buckets into `overdue`', () => {
    expect(overdueOf(buckets({ overdue0_30: '10.10', overdue90plus: '5.05', due1_30: '999' }) as never)).toBe('15.15')
  })

  const rows = [
    party('a', 'Zeta', '9.99', { overdue0_30: '9.99' }),
    party('b', 'alpha', '1000.00', { overdue31_60: '300.00' }),
    party('c', '', '50.00'),
  ]

  it('sorts by total as decimals and by overdue', () => {
    const byTotal = paginate(rows, { page: 1, pageSize: 10, sortBy: 'total', sortDir: 'desc' }, agingPartyComparators)
    expect(byTotal.rows.map((r) => r.id)).toEqual(['b', 'c', 'a'])
    const byOverdue = paginate(rows, { page: 1, pageSize: 10, sortBy: 'overdue', sortDir: 'desc' }, agingPartyComparators)
    expect(byOverdue.rows.map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })

  it('puts unknown parties (empty name) last when sorting by name', () => {
    const byName = paginate(rows, { page: 1, pageSize: 10, sortBy: 'name', sortDir: 'asc' }, agingPartyComparators)
    expect(byName.rows.map((r) => r.id)).toEqual(['b', 'a', 'c'])
  })
})
