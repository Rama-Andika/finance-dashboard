import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({ getCachedPeriods: async () => [] }))

const checkApPaidWithoutPayment = vi.fn()
const checkCardsWithoutParty = vi.fn()
const checkCardsWithInvalidLocation = vi.fn()
const checkTransitOverdue = vi.fn()
const checkUnpostedJournals = vi.fn()
const checkArPaymentsWithoutAllocation = vi.fn()
const getMappingRow = vi.fn()
const computeApAgingMock = vi.fn()
const computeArAgingMock = vi.fn()
const computeBalanceSheetMock = vi.fn()

/** A balance sheet that is in order: balanced, earnings agree, both earnings accounts found, fiscal year end known. */
const balanceSheetOk = {
  status: 'ok',
  statement: { totals: { difference: '0.00' } },
  earnings: { difference: '0.00', currentAccountFound: true, priorAccountFound: true },
  fiscal: { assumed: false },
}

vi.mock('~/server/repo/data-checks.repo', () => ({
  checkApPaidWithoutPayment: (...a: unknown[]) => checkApPaidWithoutPayment(...a),
  checkCardsWithoutParty: (...a: unknown[]) => checkCardsWithoutParty(...a),
  checkCardsWithInvalidLocation: (...a: unknown[]) => checkCardsWithInvalidLocation(...a),
  checkTransitOverdue: (...a: unknown[]) => checkTransitOverdue(...a),
  checkUnpostedJournals: (...a: unknown[]) => checkUnpostedJournals(...a),
  checkArPaymentsWithoutAllocation: (...a: unknown[]) => checkArPaymentsWithoutAllocation(...a),
}))
vi.mock('~/server/repo/settings.repo', () => ({ getMappingRow: (...a: unknown[]) => getMappingRow(...a) }))
vi.mock('~/server/services/cash/cash-position.service', () => ({
  computeCashPosition: async () => ({ reconciliation: { inSync: true, diff: '0.00' } }),
}))
vi.mock('~/server/services/cash/cash-flow.service', () => ({
  computeCashFlow: async () => ({ identityOk: true, drawers: [], source: 'setup' }),
}))
vi.mock('~/server/services/ap-ar/ap-aging.service', () => ({
  computeApAging: (...a: unknown[]) => computeApAgingMock(...a),
}))
vi.mock('~/server/services/ap-ar/ar-aging.service', () => ({
  computeArAging: (...a: unknown[]) => computeArAgingMock(...a),
}))
vi.mock('~/server/services/balance-sheet/balance-sheet.service', () => ({
  computeBalanceSheet: (...a: unknown[]) => computeBalanceSheetMock(...a),
}))

const { computeDataChecks } = await import('./data-checks.service')
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
  entityCount: 1,
  hasOpenPeriod: true,
  months: ['2026-10'],
  missingMonths: [] as string[],
}

describe('computeDataChecks', () => {
  beforeEach(() => {
    clearCache()
    computeBalanceSheetMock.mockResolvedValue(balanceSheetOk)
    checkApPaidWithoutPayment.mockResolvedValue({ count: 0, amount: '0.00' })
    checkCardsWithoutParty.mockResolvedValue(0)
    checkCardsWithInvalidLocation.mockResolvedValue(0)
    checkTransitOverdue.mockResolvedValue({ count: 0, amount: '0.00' })
    checkUnpostedJournals.mockResolvedValue(0)
    checkArPaymentsWithoutAllocation.mockResolvedValue({ count: 0, amount: '0.00' })
    getMappingRow.mockResolvedValue({ sysmainId: '1', valueprop: '{}' })
    computeApAgingMock.mockResolvedValue({
      reconciliation: { inSync: true, diff: '0.00' },
      directReturns: '0.00',
      directReturnCount: 0,
    })
    computeArAgingMock.mockResolvedValue({
      directReturns: '0.00',
      directReturnCount: 0,
    })
  })

  it('reports a balance sheet that does not balance, and asks for it without a comparison', async () => {
    computeBalanceSheetMock.mockResolvedValue({
      ...balanceSheetOk,
      statement: { totals: { difference: '25.00' } },
    })
    const checks = await computeDataChecks({ ...filter, asOf: '2026-10-20' })
    expect(checks.find((c) => c.code === 'BS_UNBALANCED')).toEqual({
      code: 'BS_UNBALANCED',
      level: 'danger',
      count: 1,
      amount: '25.00',
      link: '/balance-sheet',
    })
    expect(computeBalanceSheetMock).toHaveBeenCalledWith(expect.anything(), 'none')
  })

  it('reports earnings that differ, missing earnings accounts and an assumed fiscal year end', async () => {
    computeBalanceSheetMock.mockResolvedValue({
      ...balanceSheetOk,
      earnings: { difference: '-5.00', currentAccountFound: true, priorAccountFound: false },
      fiscal: { assumed: true },
    })
    const codes = (await computeDataChecks({ ...filter, asOf: '2026-10-21' })).map((c) => c.code)
    expect(codes).toEqual(['BS_EARNINGS_MISMATCH', 'BS_EARNINGS_ACCOUNT_MISSING', 'BS_FISCAL_MONTH_ASSUMED'])
  })

  it('has no balance sheet check when the month has no period', async () => {
    computeBalanceSheetMock.mockResolvedValue({ ...balanceSheetOk, status: 'no-period', earnings: null })
    expect(await computeDataChecks({ ...filter, asOf: '2026-10-22' })).toEqual([])
  })

  it('a failing balance sheet does not hide the other checks', async () => {
    computeBalanceSheetMock.mockRejectedValue(new Error('boom'))
    checkUnpostedJournals.mockResolvedValue(2)
    const codes = (await computeDataChecks({ ...filter, asOf: '2026-10-23' })).map((c) => c.code)
    expect(codes).toContain('UNPOSTED')
    expect(codes).toContain('CHECK_FAILED')
  })

  it('reports nothing when every check passes', async () => {
    expect(await computeDataChecks(filter)).toEqual([])
  })

  it('reports direct returns still open as level info', async () => {
    computeApAgingMock.mockResolvedValue({
      reconciliation: { inSync: true, diff: '0.00' },
      directReturns: '-100.00',
      directReturnCount: 2,
    })
    computeArAgingMock.mockResolvedValue({
      directReturns: '-50.00',
      directReturnCount: 1,
    })
    const checks = await computeDataChecks({ ...filter, asOf: '2026-10-18' })
    const directReturn = checks.find((c) => c.code === 'DIRECT_RETURN_OPEN')
    expect(directReturn).toEqual({
      code: 'DIRECT_RETURN_OPEN',
      level: 'info',
      count: 3,
      amount: '-150.00',
      link: '/payables',
    })
  })

  it('reports customer payments without allocation as warning', async () => {
    checkArPaymentsWithoutAllocation.mockResolvedValue({ count: 2, amount: '300.00' })
    const checks = await computeDataChecks({ ...filter, asOf: '2026-10-19' })
    const unalloc = checks.find((c) => c.code === 'AR_PAYMENT_UNALLOC')
    expect(unalloc).toEqual({
      code: 'AR_PAYMENT_UNALLOC',
      level: 'warning',
      count: 2,
      amount: '300.00',
      link: '/receivables',
    })
  })

  it('a slow or failing query check does not hide the other checks', async () => {
    checkCardsWithoutParty.mockRejectedValue(new Error('Query execution was interrupted'))
    checkUnpostedJournals.mockResolvedValue(3)
    const codes = (await computeDataChecks({ ...filter, asOf: '2026-10-16' })).map((c) => c.code)
    expect(codes).toContain('UNPOSTED')
    expect(codes).toContain('CHECK_FAILED')
    expect(codes).not.toContain('CARD_PARTY_MISSING')
  })

  it('a failed mapping read is reported as a failed check, not as a missing mapping', async () => {
    getMappingRow.mockRejectedValue(new Error('connection lost'))
    const codes = (await computeDataChecks({ ...filter, asOf: '2026-10-17' })).map((c) => c.code)
    expect(codes).toContain('CHECK_FAILED')
    expect(codes).not.toContain('SETTINGS')
  })
})
