import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { SQL } from 'drizzle-orm'
import { AGING_BUCKETS, AGING_BUCKET_DAYS } from '~/lib/finance/ap-ar/aging'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))

const {
  creditableBillsQuery,
  unallocatedCreditPoolsQuery,
  creditPoolsQuery,
  dueTotalsQuery,
  historySource,
  histAgingAggregates,
  histCreditData,
  itemsAggregateQuery,
  paymentsAggregateQuery,
  snapshotAgingAggregates,
  snapshotCreditData,
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
    expect(text).toContain('directReturns')
    expect(text).toContain('directReturnCount')
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
  it('ages payments by their own date from the unallocated table and counts cards', () => {
    const { sql: text } = compile(paymentsAggregateQuery(snapshotSource, 'ap', '2026-06-15', undefined))
    expect(text).toContain('dash_snap_ap_ar_unallocated')
    expect(text).toContain('DATEDIFF(?, tx_date)')
    expect(text).toContain('GROUP BY a.partyId')
    expect(text).toContain('COUNT(*) AS paymentCount')
    expect(text).toContain("kind = 'counted'")
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
            directReturns: '0',
            directReturnCount: '0',
          },
          {
            partyId: 7,
            ...bucketRow('5.5'),
            positive: '5.5',
            negative: '0',
            nonTrade: '5.5',
            overdueBills: '5.5',
            directReturns: '-3',
            directReturnCount: '2',
          },
        ]
      }
      return [{ partyId: '7', ...bucketRow('2'), paymentCount: '4' }]
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
      directReturns: '-3.00',
      directReturnCount: 2,
    })
    expect(result.items.find((r) => r.partyId === '')?.buckets.overdue0_30).toBe('10.00')
    expect(result.payments).toEqual([expect.objectContaining({ partyId: '7', count: 4 })])
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

describe('index hint on whole-side reads', () => {
  const HINT = 'FORCE INDEX (PRIMARY)'

  it('is on the open table when nothing narrows the read', () => {
    expect(compile(itemsAggregateQuery(snapshotSource, 'ap', '2026-06-15', undefined)).sql).toContain(HINT)
    expect(
      compile(
        dueTotalsQuery(snapshotSource, 'ap', undefined, undefined, {
          maxDue: '2026-06-21',
        }),
      ).sql,
    ).toContain(HINT)
  })

  it('is left out when a location slice or an invoice slice narrows the read', () => {
    expect(compile(itemsAggregateQuery(snapshotSource, 'ap', '2026-06-15', ['1'])).sql).not.toContain('FORCE INDEX')
    expect(
      compile(
        dueTotalsQuery(snapshotSource, 'ap', ['1'], undefined, {
          maxDue: '2026-06-21',
        }),
      ).sql,
    ).not.toContain('FORCE INDEX')
    expect(
      compile(
        dueTotalsQuery(snapshotSource, 'ap', undefined, ['5'], {
          maxDue: '2026-06-21',
        }),
      ).sql,
    ).not.toContain('FORCE INDEX')
  })

  it('is left out for a month-end history and for the payments table', () => {
    expect(compile(itemsAggregateQuery(historySource('2026-05-31'), 'ap', '2026-05-31', undefined)).sql).not.toContain(
      'FORCE INDEX',
    )
    expect(compile(paymentsAggregateQuery(snapshotSource, 'ap', '2026-06-15', undefined)).sql).not.toContain(
      'FORCE INDEX',
    )
  })

  it('reaches the account-list query of the open table only', async () => {
    rowsMock.mockResolvedValue([])
    await snapshotAgingAggregates('ap', '2026-06-15', 'all')
    const texts = rowsMock.mock.calls.map((call) => compile(call[0] as SQL).sql)
    const coaOfOpen = texts.find((t) => t.includes('DISTINCT') && t.includes('dash_snap_ap_ar_open'))
    const coaOfUnallocated = texts.find((t) => t.includes('DISTINCT') && t.includes('dash_snap_ap_ar_unallocated'))
    expect(coaOfOpen).toContain('FORCE INDEX (PRIMARY)')
    expect(coaOfOpen).not.toContain("kind = 'counted'")
    expect(coaOfUnallocated).not.toContain('FORCE INDEX')
    expect(coaOfUnallocated).toContain("kind = 'counted'")
  })
})

describe('credit data queries', () => {
  it('creditPoolsQuery sums negative balances per (party, entity) with scan hint when unconstrained', () => {
    const unconstrained = compile(creditPoolsQuery(snapshotSource, 'ap', undefined)).sql
    expect(unconstrained).toContain('balance < 0')
    expect(unconstrained).toContain('GROUP BY party_id, location_id')
    expect(unconstrained).toContain('FORCE INDEX (PRIMARY)')

    const withLoc = compile(creditPoolsQuery(snapshotSource, 'ap', ['1'])).sql
    expect(withLoc).not.toContain('FORCE INDEX')

    const hist = compile(creditPoolsQuery(historySource('2026-05-31'), 'ap', undefined)).sql
    expect(hist).toContain('as_of_date = ?')
    expect(hist).not.toContain('FORCE INDEX')
  })

  it('unallocatedCreditPoolsQuery sums negative balances per (party, entity) from unallocated table', () => {
    const unallocated = compile(unallocatedCreditPoolsQuery(snapshotSource, 'ar', undefined)).sql
    expect(unallocated).toContain('dash_snap_ap_ar_unallocated')
    expect(unallocated).toContain('balance < 0')
    expect(unallocated).toContain("kind = 'counted'")
    expect(unallocated).toContain('GROUP BY party_id, location_id')

    const hist = compile(unallocatedCreditPoolsQuery(historySource('2026-05-31'), 'ar', undefined)).sql
    expect(hist).toContain('dash_snap_ap_ar_hist_unallocated')
    expect(hist).toContain('as_of_date = ?')
  })

  it('creditableBillsQuery includes minDue condition when provided', () => {
    const withMin = compile(
      creditableBillsQuery(snapshotSource, 'ar', { partySlice: ['7'], maxDue: '2026-06-21', minDue: '2026-06-15' }),
    )
    expect(withMin.sql).toContain('<= ?')
    expect(withMin.sql).toContain('>= ?')
    expect(withMin.params).toContain('2026-06-21')
    expect(withMin.params).toContain('2026-06-15')

    const withoutMin = compile(creditableBillsQuery(snapshotSource, 'ar', { partySlice: ['7'], maxDue: '2026-06-21' }))
    expect(withoutMin.sql).not.toContain('>= ?')
  })

  it('snapshotCreditData merges open and unallocated pools for AR and applies minDue', async () => {
    rowsMock.mockReset()
    rowsMock
      .mockResolvedValueOnce([{ partyId: 'c1', locationId: 'l1', total: '-20.00' }]) // open pool
      .mockResolvedValueOnce([{ partyId: 'c1', locationId: 'l1', total: '-50.00' }]) // unallocated pool
      .mockResolvedValueOnce([
        { invoiceId: 'inv1', partyId: 'c1', locationId: 'l1', dueDate: '2026-06-16', balance: '100.00' },
      ]) // bills

    const res = await snapshotCreditData('ar', 'all', '2026-06-21', {
      includeUnallocated: true,
      minDue: '2026-06-15',
    })
    expect(res.pools).toEqual([
      { partyId: 'c1', locationId: 'l1', amount: '20.00' },
      { partyId: 'c1', locationId: 'l1', amount: '50.00' },
    ])
    expect(res.bills).toEqual([
      { invoiceId: 'inv1', partyId: 'c1', locationId: 'l1', dueDate: '2026-06-16', balance: '100.00' },
    ])
    expect(rowsMock).toHaveBeenCalledTimes(3)
    const billSql = compile(rowsMock.mock.calls[2]![0] as SQL)
    expect(billSql.sql).toContain('>= ?')
    expect(billSql.params).toContain('2026-06-15')
  })

  it('creditableBillsQuery reads positive bills due by maxDue without FORCE INDEX', () => {
    const billQuery = compile(creditableBillsQuery(snapshotSource, 'ap', { partySlice: ['7'], maxDue: '2026-06-21' }))
    expect(billQuery.sql).toContain('balance > 0')
    expect(billQuery.sql).toContain('party_id IN (?)')
    expect(billQuery.sql).toContain('<= ?')
    expect(billQuery.sql).not.toContain('FORCE INDEX')
    expect(billQuery.params).toContain('2026-06-21')

    const hist = compile(
      creditableBillsQuery(historySource('2026-05-31'), 'ap', { partySlice: ['7'], maxDue: '2026-06-21' }),
    ).sql
    expect(hist).toContain('as_of_date = ?')
  })

  it('snapshotCreditData maps pools and bills, dropping empty parties', async () => {
    rowsMock.mockReset()
    rowsMock
      .mockResolvedValueOnce([
        { partyId: '7', locationId: '3', total: '-30.00' },
        { partyId: null, locationId: '3', total: '-5.00' },
      ])
      .mockResolvedValueOnce([
        { invoiceId: 'i1', partyId: '7', locationId: '3', dueDate: '2026-06-10 00:00:00', balance: '40' },
      ])

    const res = await snapshotCreditData('ap', 'all', '2026-06-21')
    expect(res.pools).toEqual([{ partyId: '7', locationId: '3', amount: '30.00' }])
    expect(res.bills).toEqual([
      { invoiceId: 'i1', partyId: '7', locationId: '3', dueDate: '2026-06-10', balance: '40.00' },
    ])
  })

  it('histCreditData delegates to readCreditData with historySource', async () => {
    rowsMock.mockReset()
    rowsMock.mockResolvedValueOnce([]).mockResolvedValueOnce([])
    const res = await histCreditData('ap', '2026-05-31', 'all', '2026-06-21')
    expect(res).toEqual({ pools: [], bills: [] })
  })

  it('creditableBillsQuery without a party list scans the whole side in primary-key order', () => {
    const whole = compile(creditableBillsQuery(snapshotSource, 'ap', { maxDue: '2026-06-21' })).sql
    expect(whole).toContain('FORCE INDEX (PRIMARY)')
    expect(whole).not.toContain('party_id IN')

    // A location filter narrows the read, so the secondary indexes are better than the hint
    const withLoc = compile(creditableBillsQuery(snapshotSource, 'ap', { locSlice: ['1'], maxDue: '2026-06-21' })).sql
    expect(withLoc).not.toContain('FORCE INDEX')

    // A month-end history is read by its day, never with the hint
    const hist = compile(creditableBillsQuery(historySource('2026-05-31'), 'ap', { maxDue: '2026-06-21' })).sql
    expect(hist).not.toContain('FORCE INDEX')
    expect(hist).toContain('as_of_date = ?')
  })

  it('creditableBillsQuery puts the filters in the same places whatever order they are written in', () => {
    const a = compile(
      creditableBillsQuery(snapshotSource, 'ap', {
        maxDue: '2026-06-21',
        minDue: '2026-06-15',
        locSlice: ['1'],
        partySlice: ['7'],
      }),
    )
    const b = compile(
      creditableBillsQuery(snapshotSource, 'ap', {
        partySlice: ['7'],
        locSlice: ['1'],
        minDue: '2026-06-15',
        maxDue: '2026-06-21',
      }),
    )
    expect(a.sql).toBe(b.sql)
    expect(a.params).toEqual(b.params)
    expect(a.sql).toContain('party_id IN (?)')
    expect(a.sql).toContain('location_id IN (?)')
    expect(a.sql).toContain('>= ?')
  })

  it('without an entity filter the bills are read once for every vendor and only the vendors with a credit are kept', async () => {
    rowsMock.mockReset()
    rowsMock.mockResolvedValueOnce([{ partyId: '7', locationId: '3', total: '-30.00' }]).mockResolvedValueOnce([
      { invoiceId: 'i1', partyId: '7', locationId: '3', dueDate: '2026-06-10', balance: '40.00' },
      { invoiceId: 'i2', partyId: '8', locationId: '3', dueDate: '2026-06-11', balance: '15.00' }, // no credit: dropped
      { invoiceId: 'i3', partyId: null, locationId: '3', dueDate: '2026-06-12', balance: '5.00' }, // no vendor: dropped
    ])

    const res = await snapshotCreditData('ap', 'all', '2026-06-21')
    expect(res.bills.map((b) => b.invoiceId)).toEqual(['i1'])
    expect(rowsMock).toHaveBeenCalledTimes(2) // the pools, then one read of the bills
    const billSql = compile(rowsMock.mock.calls[1]![0] as SQL).sql
    expect(billSql).toContain('FORCE INDEX (PRIMARY)')
    expect(billSql).not.toContain('party_id IN')
  })

  it('with an entity filter the bills are read through the party list', async () => {
    rowsMock.mockReset()
    rowsMock
      .mockResolvedValueOnce([{ partyId: '7', locationId: '3', total: '-30.00' }])
      .mockResolvedValueOnce([
        { invoiceId: 'i1', partyId: '7', locationId: '3', dueDate: '2026-06-10', balance: '40.00' },
      ])

    const res = await snapshotCreditData('ap', ['3'], '2026-06-21')
    expect(res.bills.map((b) => b.invoiceId)).toEqual(['i1'])
    const billSql = compile(rowsMock.mock.calls[1]![0] as SQL).sql
    expect(billSql).toContain('party_id IN (?)')
    expect(billSql).toContain('location_id IN (?)')
    expect(billSql).not.toContain('FORCE INDEX')
  })

  it('does not read the bills at all when there are no credits', async () => {
    rowsMock.mockReset()
    rowsMock.mockResolvedValueOnce([])
    const res = await snapshotCreditData('ap', 'all', '2026-06-21')
    expect(res).toEqual({ pools: [], bills: [] })
    expect(rowsMock).toHaveBeenCalledTimes(1)
  })
})
