import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'
import type { Period } from '~/lib/core/types'

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
  account('10', '1-1000', 'Liquid Assets', 'DEBET'), // the cash account
  account('21', '2-1000', 'Current Liabilities', 'CREDIT'),
  account('61', '6-1000', 'Expense', 'DEBET'), // the other side of every cash journal
])

const period = (periodeId: string, month: string, type: Period['type'] = 0): Period => ({
  periodeId,
  name: month,
  startDate: `${month}-01`,
  endDate: `${month}-28`,
  status: 'Closed',
  type,
  tableName: 'gl',
})
const periods: Period[] = [
  period('p6', '2026-06'),
  period('p7', '2026-07'),
  period('p8', '2026-08'),
  period('p9', '2026-09'),
  period('p9x', '2026-09', 1), // period 13 of September: it is not a month of its own, so it never adds a fourth month
  period('p10', '2026-10'), // the month of asOf: not a "prior" month
]

vi.mock('~/server/context', () => ({
  buildMetricMeta: () => ({ meta: true }),
  getCachedCoaTree: async () => tree,
  getCachedPeriods: async () => periods,
}))
let cashBasket = ['10']
vi.mock('~/server/services/shared/resolved-baskets', () => ({
  loadResolvedBaskets: async () => ({ cash: cashBasket, bank: [], deposit: [], inTransit: [], fixedCost: [] }),
}))
const balancesAt = vi.fn()
vi.mock('~/server/services/cash/balance.service', () => ({
  balancesAt: (...args: unknown[]) => balancesAt(...args),
}))
const computeCashPosition = vi.fn()
vi.mock('~/server/services/cash/cash-position.service', () => ({
  computeCashPosition: (...args: unknown[]) => computeCashPosition(...args),
}))
const computePnl = vi.fn()
vi.mock('~/server/services/pnl/pnl.service', () => ({
  computePnl: (...args: unknown[]) => computePnl(...args),
}))
const linesOfCashJournals = vi.fn()
vi.mock('~/server/repo/cash/cashflow.repo', () => ({
  linesOfCashJournals: (...args: unknown[]) => linesOfCashJournals(...args),
}))

const { computeRunwayMetrics } = await import('./runway.service')
const { clearCache } = await import('~/server/cache')

const filter = {
  asOf: '2026-10-15',
  entitySegmentColumn: 'segment1_id',
  segmentDetailIds: 'all',
} as never

/** The two lines of one cash journal in a period: the cash account and the expense account on the other side. */
function journal(glId: string, periodId: string, net: number) {
  const amount = Math.abs(net).toFixed(2)
  const cashDebit = net >= 0
  return [
    {
      glId,
      journalType: 1,
      periodId,
      coaId: '10',
      segmentDetailId: null,
      debet: cashDebit ? amount : '0.00',
      credit: cashDebit ? '0.00' : amount,
    },
    {
      glId,
      journalType: 1,
      periodId,
      coaId: '61',
      segmentDetailId: null,
      debet: cashDebit ? '0.00' : amount,
      credit: cashDebit ? amount : '0.00',
    },
  ]
}

const pnlLines = (revenue: string, grossProfit: string, netProfit: string) => ({
  lines: [
    { key: 'revenue', amount: revenue },
    { key: 'grossProfit', amount: grossProfit },
    { key: 'netProfit', amount: netProfit },
  ],
})

describe('computeRunwayMetrics', () => {
  beforeEach(() => {
    clearCache()
    cashBasket = ['10']
    for (const m of [balancesAt, computeCashPosition, computePnl, linesOfCashJournals]) m.mockReset()
    computeCashPosition.mockResolvedValue({ cashPosition: '3000.00' })
    computePnl.mockResolvedValue(pnlLines('1000.00', '600.00', '250.00'))
    balancesAt.mockResolvedValue({
      byCoa: new Map([
        ['10', '2000.00'],
        ['21', '1000.00'],
      ]),
    })
    // The three full months before October lose 300, 600 and 900: the average burn is -600 a month.
    linesOfCashJournals.mockResolvedValue([
      ...journal('g7', 'p7', -300),
      ...journal('g8', 'p8', -600),
      ...journal('g9', 'p9', -900),
    ])
  })

  it('divides the cash position by the average burn of the three full months before asOf', async () => {
    const result = await computeRunwayMetrics(filter)
    expect(result.avgBurn).toBe('-600.00')
    expect(result.runwayMonths).toBe('5.0') // 3000 / 600
    expect(result.cashFlowPositive).toBe(false)
    expect(result.meta).toEqual({ meta: true })
  })

  it('reads the journals of exactly those three months, for the cash accounts', async () => {
    await computeRunwayMetrics(filter)
    expect(linesOfCashJournals).toHaveBeenCalledTimes(1)
    const call = linesOfCashJournals.mock.calls[0]?.[0] as { periods: Period[]; cashCoaIds: string[]; segCol: string }
    const ids = call.periods.map((p) => p.periodeId)
    expect(ids).toEqual(expect.arrayContaining(['p7', 'p8', 'p9']))
    expect(ids).not.toContain('p6') // a fourth month back
    expect(ids).not.toContain('p10') // the month of asOf itself
    expect(call.cashCoaIds).toEqual(['10'])
    expect(call.segCol).toBe('segment1_id')
  })

  it('has no runway to report when the cash flow is positive', async () => {
    linesOfCashJournals.mockResolvedValue([
      ...journal('g7', 'p7', 100),
      ...journal('g8', 'p8', 200),
      ...journal('g9', 'p9', 300),
    ])
    const result = await computeRunwayMetrics(filter)
    expect(result.avgBurn).toBe('200.00')
    expect(result.runwayMonths).toBeNull()
    expect(result.cashFlowPositive).toBe(true)
  })

  it('takes the margins from the P&L and the current ratio from the liquid assets and current liabilities', async () => {
    const result = await computeRunwayMetrics(filter)
    expect(Number(result.grossMargin)).toBeCloseTo(0.6, 4)
    expect(Number(result.netMargin)).toBeCloseTo(0.25, 4)
    expect(result.currentRatio).toBe('2.00') // 2000 / 1000
    expect(balancesAt).toHaveBeenCalledWith(expect.objectContaining({ asOf: '2026-10-15', coaIds: ['10', '21'] }))
  })

  it('has no margins without revenue and no current ratio without current liabilities', async () => {
    computePnl.mockResolvedValue(pnlLines('0.00', '0.00', '0.00'))
    balancesAt.mockResolvedValue({ byCoa: new Map([['10', '2000.00']]) })
    const result = await computeRunwayMetrics(filter)
    expect(result.grossMargin).toBeNull()
    expect(result.netMargin).toBeNull()
    expect(result.currentRatio).toBeNull()
  })

  it('has zero burn, and reads no journals, when no cash account is mapped', async () => {
    cashBasket = []
    const result = await computeRunwayMetrics(filter)
    expect(linesOfCashJournals).not.toHaveBeenCalled()
    expect(result.avgBurn).toBe('0.00')
    expect(result.cashFlowPositive).toBe(true)
  })

  it('has zero burn, and reads no journals, when there is no full month before asOf', async () => {
    const result = await computeRunwayMetrics({ ...(filter as object), asOf: '2026-06-10' } as never)
    expect(linesOfCashJournals).not.toHaveBeenCalled()
    expect(result.avgBurn).toBe('0.00')
  })

  it('answers repeated calls for the same filter from the memo', async () => {
    await computeRunwayMetrics(filter)
    await computeRunwayMetrics(filter)
    expect(computeCashPosition).toHaveBeenCalledTimes(1)
  })
})
