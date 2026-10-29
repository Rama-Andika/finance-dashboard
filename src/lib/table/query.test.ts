import { describe, expect, it } from 'vitest'
import { compareMoney, compareText, paginate, tableQuerySchema, type TableQuery } from './query'

type Row = { name: string; total: string }
const rows: Row[] = [
  { name: 'beta', total: '1000.50' },
  { name: 'Alpha', total: '9.99' },
  { name: 'gamma', total: '1000.50' },
  { name: 'delta', total: '-5.00' },
]
const comparators = {
  name: (a: Row, b: Row) => compareText(a.name, b.name),
  total: (a: Row, b: Row) => compareMoney(a.total, b.total),
}
const q = (over: Partial<TableQuery>): TableQuery => ({ page: 1, pageSize: 25, sortDir: 'asc', ...over })

describe('paginate', () => {
  it('sorts money as decimals, not text ("9.99" < "1000.50")', () => {
    const asc = paginate(rows, q({ sortBy: 'total' }), comparators).rows.map((r) => r.name)
    expect(asc).toEqual(['delta', 'Alpha', 'beta', 'gamma'])
    const desc = paginate(rows, q({ sortBy: 'total', sortDir: 'desc' }), comparators).rows.map((r) => r.name)
    expect(desc).toEqual(['beta', 'gamma', 'Alpha', 'delta'])
  })

  it('is stable: equal values keep their original order in both directions', () => {
    const desc = paginate(rows, q({ sortBy: 'total', sortDir: 'desc' }), comparators).rows
    expect(desc.slice(0, 2).map((r) => r.name)).toEqual(['beta', 'gamma'])
  })

  it('sorts text case-insensitively', () => {
    expect(paginate(rows, q({ sortBy: 'name' }), comparators).rows.map((r) => r.name)).toEqual(['Alpha', 'beta', 'delta', 'gamma'])
  })

  it('ignores a sort key that is not in the whitelist', () => {
    expect(paginate(rows, q({ sortBy: 'password' }), comparators).rows.map((r) => r.name)).toEqual(['beta', 'Alpha', 'gamma', 'delta'])
  })

  it('slices pages and reports the total of the whole result', () => {
    const p2 = paginate(rows, q({ page: 2, pageSize: 3, sortBy: 'name' }), comparators)
    expect(p2.rows.map((r) => r.name)).toEqual(['gamma'])
    expect(p2.total).toBe(4)
    expect(p2.page).toBe(2)
  })

  it('clamps a page beyond the end to the last page, and handles an empty result', () => {
    expect(paginate(rows, q({ page: 99, pageSize: 3 }), comparators).page).toBe(2)
    const empty = paginate([], q({ page: 5 }), comparators)
    expect(empty).toEqual({ rows: [], total: 0, page: 1, pageSize: 25 })
  })
})

describe('tableQuerySchema', () => {
  const schema = tableQuerySchema(['name', 'total'] as const)

  it('falls back to safe defaults for junk input', () => {
    expect(schema.parse({ page: 'x', pageSize: 7, sortBy: 'drop', sortDir: 'up' })).toEqual({
      page: 1,
      pageSize: 25,
      sortBy: undefined,
      sortDir: 'asc',
    })
  })

  it('accepts valid values, including numeric strings from the URL', () => {
    expect(schema.parse({ page: '3', pageSize: '50', sortBy: 'total', sortDir: 'desc' })).toEqual({
      page: 3,
      pageSize: 50,
      sortBy: 'total',
      sortDir: 'desc',
    })
  })
})
