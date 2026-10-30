import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MySqlDialect } from 'drizzle-orm/mysql-core'
import type { SQL } from 'drizzle-orm'

const rowsMock = vi.fn()
vi.mock('~/server/db/query', () => ({ rows: (...args: unknown[]) => rowsMock(...args) }))

const { outstandingGiro } = await import('./bank-payment.repo')
const { clearCache } = await import('~/server/cache')

describe('outstandingGiro', () => {
  beforeEach(() => {
    rowsMock.mockReset()
    clearCache()
  })

  it('is zero without querying when no entity is selected', async () => {
    expect(await outstandingGiro('2026-10-30', [])).toBe('0.00')
    expect(rowsMock).not.toHaveBeenCalled()
  })

  it('returns the summed amount with two decimals', async () => {
    rowsMock.mockResolvedValue([{ amount: '1500.5' }])
    expect(await outstandingGiro('2026-10-30', 'all')).toBe('1500.50')
  })

  it('only counts giro, cheque and e-banking payments that are not cleared at the as-of day', async () => {
    rowsMock.mockResolvedValue([{ amount: '0' }])
    await outstandingGiro('2026-09-30', 'all')
    const query = new MySqlDialect().sqlToQuery(rowsMock.mock.calls[0]![0] as SQL)
    expect(query.sql).toContain('bp.type IN (0, 4, 7)')
    expect(query.sql).toContain('bp.payment_date >=')
    expect(query.params).toContain('2026-10-01')
  })
})
