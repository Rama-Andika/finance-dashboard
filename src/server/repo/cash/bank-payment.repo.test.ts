import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { SQL } from 'drizzle-orm'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))

const { unsettledAtClause, unsettledByChannel, unsettledTransactions } = await import('./bank-payment.repo')
const { clearCache } = await import('~/server/cache')

const render = (query: SQL) => new MySqlDialect().sqlToQuery(query)
const firstQuery = (): SQL => rowsMock.mock.calls[0]![0] as SQL

describe('unsettledAtClause', () => {
  it('keeps rows that are open now or were settled only after the as-of day', () => {
    const { sql, params } = render(unsettledAtClause('2026-10-31'))
    expect(sql).toBe('AND (bp.status = ? OR (bp.status = ? AND bp.payment_date >= ?))')
    expect(params).toEqual([0, 1, '2026-10-31'])
  })
})

describe('unsettledByChannel', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    rowsMock.mockResolvedValue([])
    clearCache()
  })

  it('does not query when there are no channel accounts', async () => {
    expect(await unsettledByChannel('2026-10-30', [], 'all')).toEqual([])
    expect(rowsMock).not.toHaveBeenCalled()
  })

  it('counts rows settled after the as-of day as still unsettled on that day', async () => {
    await unsettledByChannel('2026-09-30', ['10'], 'all')
    expect(rowsMock).toHaveBeenCalledTimes(1)
    const { sql, params } = render(firstQuery())
    expect(sql).toContain('bp.payment_date >=')
    expect(params).toContain('2026-10-01')
  })
})

describe('unsettledTransactions', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    rowsMock.mockResolvedValue([])
  })

  it('uses the same rule as the totals so the drill-down adds up to them', async () => {
    await unsettledTransactions({ coaId: '10', asOf: '2026-09-30', segCol: 'segment1_id', segIds: 'all', limit: 10, offset: 0 })
    const { sql, params } = render(firstQuery())
    expect(sql).toContain('bp.payment_date >=')
    expect(params).toContain('2026-10-01')
  })
})
