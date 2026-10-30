import { describe, expect, it } from 'vitest'
import Decimal from 'decimal.js'
import {
  compareIsoDate,
  compareMoney,
  compareText,
  createViewCache,
  pageOfSorted,
  paginate,
  sortRows,
  tableQuerySchema,
  type TableQuery,
} from './query'

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

describe('compareMoney', () => {
  it('orders signs, magnitudes and fractions like decimal numbers', () => {
    expect(compareMoney('9.99', '1000.50')).toBe(-1)
    expect(compareMoney('1000.50', '1000.5')).toBe(0)
    expect(compareMoney('-5.00', '3')).toBe(-1)
    expect(compareMoney('-5.00', '-3')).toBe(-1)
    expect(compareMoney('-3', '-5.00')).toBe(1)
    expect(compareMoney('0.01', '0.009')).toBe(1)
  })

  it('treats -0 and 0 as equal but 378 and -378 as different', () => {
    expect(compareMoney('0.00', '-0.00')).toBe(0)
    expect(compareMoney('378', '-378')).toBe(1)
    expect(compareMoney('-452', '452')).toBe(-1)
  })

  it('treats an empty string as zero and still handles shapes it cannot read quickly', () => {
    expect(compareMoney('', '0.00')).toBe(0)
    expect(compareMoney('', '1')).toBe(-1)
    expect(compareMoney('007.50', '7.5')).toBe(0)
    expect(compareMoney('1e3', '999')).toBe(1)
  })

  it('agrees with Decimal on random values', () => {
    const random = (): string => {
      const sign = Math.random() < 0.4 ? '-' : ''
      const int = String(Math.floor(Math.random() * 1000))
      const frac = Math.random() < 0.7 ? `.${String(Math.floor(Math.random() * 1000)).padStart(Math.ceil(Math.random() * 3), '0')}` : ''
      return `${sign}${int}${frac}`
    }
    for (let i = 0; i < 20000; i += 1) {
      const a = random()
      const b = Math.random() < 0.2 ? a : random()
      expect(compareMoney(a, b), `${a} vs ${b}`).toBe(new Decimal(a).cmp(new Decimal(b)))
    }
  })
})

describe('compareText and compareIsoDate', () => {
  it('compareText ignores case and accents like localeCompare with base sensitivity', () => {
    const words = ['beta', 'Alpha', 'álpha', 'gamma', 'ALPHA', 'delta']
    const viaLocale = [...words].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    expect([...words].sort(compareText)).toEqual(viaLocale)
    expect(compareText('Alpha', 'alpha')).toBe(0)
  })

  it('compareIsoDate orders ISO dates', () => {
    expect(compareIsoDate('2026-10-01', '2026-10-31')).toBe(-1)
    expect(compareIsoDate('2026-10-31', '2026-10-31')).toBe(0)
    expect(compareIsoDate('2027-01-01', '2026-12-31')).toBe(1)
  })
})

describe('sortRows and pageOfSorted', () => {
  it('sortRows returns a sorted copy and keeps equal rows in their original order, also descending', () => {
    const copy = [...rows]
    const desc = sortRows(rows, comparators.total, 'desc')
    expect(desc.map((r) => r.name)).toEqual(['beta', 'gamma', 'Alpha', 'delta'])
    expect(rows).toEqual(copy)
  })

  it('pageOfSorted slices a sorted list without sorting it again', () => {
    const page = pageOfSorted(['c', 'a', 'b'], q({ page: 2, pageSize: 2 }))
    expect(page).toEqual({ rows: ['b'], total: 3, page: 2, pageSize: 2 })
  })
})

describe('createViewCache', () => {
  it('builds a view once per source list and view key', () => {
    const view = createViewCache<number>()
    const source = [3, 1, 2]
    let builds = 0
    const build = () => {
      builds += 1
      return [...source].sort()
    }
    expect(view(source, 'asc', build)).toEqual([1, 2, 3])
    view(source, 'asc', build)
    view(source, 'desc', build)
    expect(builds).toBe(2)
    view([3, 1, 2], 'asc', build)
    expect(builds).toBe(3)
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
