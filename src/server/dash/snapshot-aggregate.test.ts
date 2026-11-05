import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { SQL } from 'drizzle-orm'
import { AGING_BUCKETS, AGING_BUCKET_DAYS } from '~/lib/finance/ap-ar/aging'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))

const {
  dueTotalsQuery,
  historySource,
  histAgingAggregates,
  itemsAggregateQuery,
  paymentsAggregateQuery,
  snapshotAgingAggregates,
  snapshotDueTotals,
  snapshotSource,
} = await import('./snapshot-aggregate')

const dialect = new MySqlDialect()
const compile = (query: SQL) => dialect.sqlToQuery(query)

describe('itemsAggregateQuery', () => {
  it('sums every bucket from the shared day ranges, per party, with no window function or CTE', () => {
    const { sql: text, params } = compile(itemsAggregateQuery(snapshotSource, 'ap', '2026-06-15', undefined))
    expect(text).toContain('dash_snap_ap_ar_open')
    expect(text).toContain('GROUP BY a.partyId')
    expect(text).toContain('DATEDIFF(?, COALESCE(due_date, tx_date))')
    expect(text.match(/BETWEEN \? AND \?/g)).toHaveLength(AGING_BUCKETS.length)
    for (const bucket of AGING_BUCKETS) expect(text).toContain(`\`${bucket}\``)
    expect(text).not.toMatch(/\bOVER\s*\(/i)
    expect(text).not.toMatch(/\bWITH\b/i)
    // the day ranges travel as parameters, in bucket order, before the date
    const ranges = AGING_BUCKETS.flatMap((b) => [AGING_BUCKET_DAYS[b].min, AGING_BUCKET_DAYS[b].max])
    expect(params.slice(0, ranges.length)).toEqual(ranges)
    expect(params).toContain('2026-06-15')
  })

  it('filters by location slice and, for a month-end history, by the day', () => {
    const plain = compile(itemsAggregateQuery(snapshotSource, 'ap', '2026-06-15', undefined))
    expect(plain.sql).not.toContain('location_id IN')
    expect(plain.sql).not.toContain('as_of_date')

    const filtered = compile(itemsAggregateQuery(historySource('2026-05-31'), 'ar', '2026-05-31', ['10', '11']))
    expect(filtered.sql).toContain('dash_snap_ap_ar_hist_open')
    expect(filtered.sql).toContain('as_of_date = ?')
    expect(filtered.sql).toContain('location_id IN')
    expect(filtered.params).toEqual(expect.arrayContaining(['2026-05-31', '10', '11']))
  })
})

describe('paymentsAggregateQuery', () => {
  it('ages payments by their own date from the unallocated table', () => {
    const { sql: text } = compile(paymentsAggregateQuery(snapshotSource, 'ap', '2026-06-15', undefined))
    expect(text).toContain('dash_snap_ap_ar_unallocated')
    expect(text).toContain('DATEDIFF(?, tx_date)')
    expect(text).toContain('GROUP BY a.partyId')
  })
})

describe('dueTotalsQuery', () => {
  it('sums open balances above zero per due date within the limits', () => {
    const { sql: text, params } = compile(
      dueTotalsQuery(snapshotSource, 'ap', undefined, undefined, {
        maxDue: '2026-06-21',
        minDue: '2026-06-15',
      }),
    )
    expect(text).toContain('balance > 0')
    expect(text).toContain('GROUP BY t.dueDate')
    expect(text).toContain('t.dueDate <= ?')
    expect(text).toContain('t.dueDate >= ?')
    expect(text).not.toContain('card_id IN')
    expect(params).toEqual(expect.arrayContaining(['2026-06-21', '2026-06-15']))
  })

  it('restricts to invoice ids only when given', () => {
    const { sql: text, params } = compile(
      dueTotalsQuery(snapshotSource, 'ap', undefined, ['5', '6'], {
        maxDue: '2026-06-21',
      }),
    )
    expect(text).toContain('card_id IN')
    expect(text).not.toContain('t.dueDate >=')
    expect(params).toEqual(expect.arrayContaining(['5', '6']))
  })
})

describe('reading aggregates', () => {
  beforeEach(() => {
    rowsMock.mockReset()
  })

  const bucketRow = (overdue0_30: string) => ({
    overdue0_30,
    overdue31_60: '0',
    overdue61_90: '0',
    overdue90plus: '0',
    due1_30: '0',
    due31_60: '0',
    due61_90: '0',
    due90plus: '0',
  })

  /** Answers each query by what it asks for, so the test does not depend on the order of the four reads. */
  function answer() {
    rowsMock.mockImplementation(async (query: SQL) => {
      const text = compile(query).sql
      if (text.includes('DISTINCT coa_id')) return [{ coaId: '21' }, { coaId: '22' }]
      if (text.includes('overdueBills')) {
        return [
          {
            partyId: null,
            ...bucketRow('10'),
            positive: '10',
            negative: '0',
            nonTrade: '0',
            overdueBills: '10',
          },
          {
            partyId: 7,
            ...bucketRow('5.5'),
            positive: '5.5',
            negative: '0',
            nonTrade: '5.5',
            overdueBills: '5.5',
          },
        ]
      }
      return [{ partyId: '7', ...bucketRow('2') }]
    })
  }

  it('shapes the rows: empty party for a missing id, two-decimal money, distinct accounts', async () => {
    answer()
    const result = await snapshotAgingAggregates('ap', '2026-06-15', 'all')
    expect(result.items.map((r) => r.partyId).sort()).toEqual(['', '7'])
    expect(result.items.find((r) => r.partyId === '7')).toMatchObject({
      positive: '5.50',
      nonTrade: '5.50',
      overdueBills: '5.50',
    })
    expect(result.items.find((r) => r.partyId === '')?.buckets.overdue0_30).toBe('10.00')
    expect(result.payments).toEqual([expect.objectContaining({ partyId: '7' })])
    expect(result.coaIds).toEqual(['21', '22'])
  })

  it('adds the slices of a long location list together', async () => {
    answer()
    const manyLocations = Array.from({ length: 1001 }, (_, i) => String(i + 1)) // two slices
    const result = await histAgingAggregates('ap', '2026-05-31', manyLocations)
    expect(result.items.find((r) => r.partyId === '7')?.buckets.overdue0_30).toBe('11.00') // 5.5 + 5.5
    expect(result.coaIds).toEqual(['21', '22'])
  })

  it('sums due-date totals across slices and trims the date', async () => {
    rowsMock.mockResolvedValue([{ dueDate: '2026-06-16 00:00:00', total: '3.25' }])
    const manyLocations = Array.from({ length: 1001 }, (_, i) => String(i + 1))
    const totals = await snapshotDueTotals('ap', manyLocations, { maxDue: '2026-06-21' })
    expect(totals.get('2026-06-16')).toBe('6.50')
  })

  it('reads nothing for an empty invoice list', async () => {
    const totals = await snapshotDueTotals('ap', 'all', {
      maxDue: '2026-06-21',
      invoiceIds: [],
    })
    expect(totals.size).toBe(0)
    expect(rowsMock).not.toHaveBeenCalled()
  })
})
