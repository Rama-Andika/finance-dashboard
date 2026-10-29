import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildCoaTree } from '~/lib/finance/coa/coa-tree'

const tree = buildCoaTree([
  { coaId: '11', parentId: '0', code: '1-1000', name: 'Cash', status: 'POSTABLE', level: 1, accountGroup: 'Liquid Assets', subAccountGroup: 'Cash', saldoNormal: 'DEBET' },
  { coaId: '61', parentId: '0', code: '6-1000', name: 'Rent', status: 'POSTABLE', level: 1, accountGroup: 'Expense', subAccountGroup: '', saldoNormal: 'DEBET' },
  { coaId: '51', parentId: '0', code: '5-1000', name: 'Materials', status: 'POSTABLE', level: 1, accountGroup: 'Cost Of Sales', subAccountGroup: '', saldoNormal: 'DEBET' },
])
const entities = [
  { locationId: 'locA', code: 'A', name: 'Store A', isActive: true, segmentDetailIds: ['sA'] },
  { locationId: 'locB', code: 'B', name: 'Store B', isActive: true, segmentDetailIds: ['sB'] },
]

vi.mock('~/server/env', () => ({ env: { ociRootCodes: [], APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({
  getCachedCoaTree: async () => tree,
  getCachedPeriods: async () => [
    { periodeId: 'p1', name: 'Oct', startDate: '2026-10-01', endDate: '2026-10-31', status: 'Open', type: 0, tableName: 'gl' },
  ],
  getCachedEntities: async () => ({ segment: { segmentId: 's', columnName: 'segment1_id' }, entities }),
  buildMetricMeta: () => ({}),
}))
vi.mock('~/server/services/shared/mapping.helper', () => ({
  loadAccountMapping: async () => ({
    version: 1,
    updatedAt: 'now',
    baskets: {
      cash: { include: ['11'] },
      bank: { include: [] },
      deposit: { include: [] },
      inTransit: { include: [] },
      fixedCost: { include: [] },
    },
  }),
}))

const expensePaidAllocated = vi.fn()
const expensePaidUnallocated = vi.fn()
const linesOfCashJournals = vi.fn()
vi.mock('~/server/repo/expense-paid.repo', () => ({
  expensePaidAllocated: (...a: unknown[]) => expensePaidAllocated(...a),
  expensePaidUnallocated: (...a: unknown[]) => expensePaidUnallocated(...a),
}))
vi.mock('~/server/repo/party.repo', () => ({ listVendors: async () => [] }))
vi.mock('~/server/repo/cashflow.repo', () => ({ linesOfCashJournals: (...a: unknown[]) => linesOfCashJournals(...a) }))

const { computeExpensePaid } = await import('./expense-paid.service')
const { clearCache } = await import('~/server/cache')

const filter = {
  locationIds: 'all' as const,
  segmentDetailIds: 'all' as const,
  d1: '2026-10-01',
  asOf: '2026-10-15',
  periodIds: ['p1'],
  compare: { d1: '', asOf: '', periodIds: [] as string[] },
  today: '2026-10-15',
  entitySegmentColumn: 'segment1_id',
  entityCount: 2,
  hasOpenPeriod: true,
  months: ['2026-10'],
  missingMonths: [] as string[],
}

const line = (glId: string, coaId: string, seg: string, debet: string, credit: string) => ({
  glId, journalType: 1, periodId: 'p1', coaId, segmentDetailId: seg, debet, credit,
})

describe('computeExpensePaid', () => {
  beforeEach(() => {
    clearCache()
    expensePaidAllocated.mockReset()
    expensePaidUnallocated.mockReset()
    linesOfCashJournals.mockReset()
    expensePaidAllocated.mockResolvedValue([
      { cardId: 'c1', cardNumber: 'C1', txDate: '2026-10-02', locationId: 'locA', vendorId: 'v1', itemType: 1, detailSum: '200.00' },
      { cardId: 'c2', cardNumber: 'C2', txDate: '2026-10-03', locationId: 'locB', vendorId: 'v1', itemType: 3, detailSum: '999.00' }, // type 3 is not a bill
    ])
    expensePaidUnallocated.mockResolvedValue([
      { cardId: 'c3', cardNumber: 'C3', txDate: '2026-10-04', locationId: 'locB', vendorId: 'v2', signedAmount: '-50.00' },
    ])
    linesOfCashJournals.mockResolvedValue([
      // Rent 100 paid in cash for store A, Materials 40 paid for store B
      line('g1', '11', 'sA', '0.00', '100.00'),
      line('g1', '61', 'sA', '100.00', '0.00'),
      line('g2', '11', 'sB', '0.00', '40.00'),
      line('g2', '51', 'sB', '40.00', '0.00'),
    ])
  })

  it('the per-entity amounts add up to the total (same rule for the page and the table)', async () => {
    const res = await computeExpensePaid(filter)
    expect(res.apPayments).toBe('200.00')
    expect(res.unallocatedPayments).toBe('50.00')
    expect(res.directPayments).toBe('140.00')
    expect(res.total).toBe('390.00')

    const byCode = Object.fromEntries(res.byEntity.map((e) => [e.code, e.amount]))
    expect(byCode).toEqual({ A: '300.00', B: '90.00' })
    const entitySum = res.byEntity.reduce((acc, e) => acc + Number(e.amount), 0)
    expect(entitySum).toBe(Number(res.total))
  })

  it('reads the cash journals once, for the widest cash list, so Cash Flow can share the read', async () => {
    await computeExpensePaid(filter)
    expect(linesOfCashJournals).toHaveBeenCalledTimes(1)
    expect(linesOfCashJournals.mock.calls[0]![0].cashCoaIds).toEqual(['11'])
  })

  it('reads each card list once', async () => {
    await computeExpensePaid(filter)
    expect(expensePaidAllocated).toHaveBeenCalledTimes(1)
    expect(expensePaidUnallocated).toHaveBeenCalledTimes(1)
  })
})
