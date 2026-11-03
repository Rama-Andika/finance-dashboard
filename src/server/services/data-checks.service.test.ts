import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/server/env', () => ({ env: { APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({ getCachedPeriods: async () => [] }))

const checkApPaidWithoutPayment = vi.fn()
const checkCardsWithoutParty = vi.fn()
const checkCardsWithInvalidLocation = vi.fn()
const checkTransitOverdue = vi.fn()
const checkUnpostedJournals = vi.fn()
const getMappingRow = vi.fn()

vi.mock('~/server/repo/data-checks.repo', () => ({
  checkApPaidWithoutPayment: (...a: unknown[]) => checkApPaidWithoutPayment(...a),
  checkCardsWithoutParty: (...a: unknown[]) => checkCardsWithoutParty(...a),
  checkCardsWithInvalidLocation: (...a: unknown[]) => checkCardsWithInvalidLocation(...a),
  checkTransitOverdue: (...a: unknown[]) => checkTransitOverdue(...a),
  checkUnpostedJournals: (...a: unknown[]) => checkUnpostedJournals(...a),
}))
vi.mock('~/server/repo/settings.repo', () => ({ getMappingRow: (...a: unknown[]) => getMappingRow(...a) }))
vi.mock('~/server/services/cash/cash-position.service', () => ({
  computeCashPosition: async () => ({ reconciliation: { inSync: true, diff: '0.00' } }),
}))
vi.mock('~/server/services/cash/cash-flow.service', () => ({
  computeCashFlow: async () => ({ identityOk: true, drawers: [], source: 'setup' }),
}))
vi.mock('~/server/services/ap-ar/ap-aging.service', () => ({
  computeApAging: async () => ({ reconciliation: { inSync: true, diff: '0.00' } }),
}))
vi.mock('~/server/services/ap-ar/ar-aging.service', () => ({
  computeArAging: async () => ({ unallocatedReturns: '0.00' }),
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
    vi.spyOn(console, 'error').mockImplementation(() => {})
    checkApPaidWithoutPayment.mockResolvedValue({ count: 0, amount: '0.00' })
    checkCardsWithoutParty.mockResolvedValue(0)
    checkCardsWithInvalidLocation.mockResolvedValue(0)
    checkTransitOverdue.mockResolvedValue({ count: 0, amount: '0.00' })
    checkUnpostedJournals.mockResolvedValue(0)
    getMappingRow.mockResolvedValue({ sysmainId: '1', valueprop: '{}' })
  })

  it('reports nothing when every check passes', async () => {
    expect(await computeDataChecks(filter)).toEqual([])
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
