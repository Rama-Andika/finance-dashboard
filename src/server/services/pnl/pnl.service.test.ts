import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'

const account = (coaId: string, code: string, accountGroup: string, saldoNormal: 'DEBET' | 'CREDIT') => ({
  coaId,
  parentId: '0',
  code,
  name: code,
  status: 'POSTABLE' as const,
  level: 1,
  accountGroup: accountGroup as never,
  subAccountGroup: '',
  saldoNormal,
})
const tree = buildCoaTree([
  account('11', '1-1000', 'Liquid Assets', 'DEBET'), // a balance sheet account: never part of the P&L
  account('41', '4-1000', 'Revenue', 'CREDIT'),
  account('51', '5-1000', 'Cost Of Sales', 'DEBET'),
  account('61', '6-1000', 'Expense', 'DEBET'),
])

vi.mock('~/server/context', () => ({
  buildMetricMeta: () => ({ meta: true }),
  getCachedCoaTree: async () => tree,
}))

const loadPlMovements = vi.fn()
vi.mock('~/server/services/pnl/pl-movements', () => ({
  loadPlMovements: (...args: unknown[]) => loadPlMovements(...args),
  onlyAccounts: (rows: Array<{ coaId: string }>, ids: Iterable<string>) => {
    const wanted = new Set(ids)
    return rows.filter((r) => wanted.has(r.coaId))
  },
}))

const { computePnl } = await import('./pnl.service')
const { clearCache } = await import('~/server/cache')

const baseFilter = {
  periodIds: ['p1'],
  compare: { d1: '', asOf: '', periodIds: [] as string[] },
}
const filterOf = (patch: Record<string, unknown> = {}) => ({ ...baseFilter, ...patch }) as never
const move = (coaId: string, debet: string, credit: string) => ({ coaId, periodId: 'p1', debet, credit })

const amountOf = (lines: Array<{ key: string; amount: string }>, key: string) =>
  lines.find((l) => l.key === key)?.amount

describe('computePnl', () => {
  beforeEach(() => {
    clearCache()
    loadPlMovements.mockReset()
  })

  it('reads nothing and returns an empty statement when the filter has no period', async () => {
    const result = await computePnl(filterOf({ periodIds: [] }))
    expect(loadPlMovements).not.toHaveBeenCalled()
    expect(result.compare).toBeNull()
    expect(amountOf(result.lines, 'revenue')).toBe('0.00')
    expect(amountOf(result.lines, 'netProfit')).toBe('0.00')
  })

  it('builds the statement lines from the movements of the P&L accounts', async () => {
    loadPlMovements.mockResolvedValue([
      move('41', '0.00', '1000.00'), // revenue: credit side
      move('51', '400.00', '0.00'), // cost of sales: debit side
      move('61', '100.00', '0.00'), // operating expense
    ])
    const result = await computePnl(filterOf())
    expect(loadPlMovements).toHaveBeenCalledTimes(1)
    expect(loadPlMovements).toHaveBeenCalledWith(expect.anything(), ['p1'])
    expect(amountOf(result.lines, 'revenue')).toBe('1000.00')
    expect(amountOf(result.lines, 'cogs')).toBe('400.00')
    expect(amountOf(result.lines, 'grossProfit')).toBe('600.00')
    expect(amountOf(result.lines, 'opex')).toBe('100.00')
    expect(amountOf(result.lines, 'operatingProfit')).toBe('500.00')
    expect(amountOf(result.lines, 'netProfit')).toBe('500.00')
    expect(result.compare).toBeNull()
    expect(result.meta).toEqual({ meta: true })
  })

  it('leaves out movements of accounts that are not in the P&L', async () => {
    loadPlMovements.mockResolvedValue([move('41', '0.00', '1000.00'), move('11', '9999.00', '0.00')])
    const result = await computePnl(filterOf())
    expect(amountOf(result.lines, 'revenue')).toBe('1000.00')
    expect(amountOf(result.lines, 'netProfit')).toBe('1000.00')
  })

  it('reads the compare period separately and returns its amount per line', async () => {
    loadPlMovements.mockImplementation(async (_filter: unknown, periodIds: string[]) =>
      periodIds[0] === 'p0' ? [move('41', '0.00', '800.00')] : [move('41', '0.00', '1000.00')],
    )
    const result = await computePnl(filterOf({ compare: { d1: '2026-09-01', asOf: '2026-09-30', periodIds: ['p0'] } }))
    expect(loadPlMovements).toHaveBeenCalledTimes(2)
    expect(loadPlMovements).toHaveBeenCalledWith(expect.anything(), ['p0'])
    expect(amountOf(result.lines, 'revenue')).toBe('1000.00')
    expect(result.compare?.revenue).toBe('800.00')
    expect(result.compare?.netProfit).toBe('800.00')
  })

  it('does not read a compare period when the compare has no period', async () => {
    loadPlMovements.mockResolvedValue([])
    await computePnl(filterOf())
    expect(loadPlMovements).toHaveBeenCalledTimes(1)
  })
})
