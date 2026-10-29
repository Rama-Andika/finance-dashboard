import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('~/server/env', () => ({ env: { ociRootCodes: [], APP_TODAY: '2026-10-15', APP_TIMEZONE: 'Asia/Jakarta' } }))
vi.mock('~/server/context', () => ({ getCachedPeriods: async () => [] }))

const checkQ1b = vi.fn()
const checkQ7 = vi.fn()
const checkQ8 = vi.fn()
const checkQ9 = vi.fn()
const checkUnpostedJournals = vi.fn()
const getMappingRow = vi.fn()

vi.mock('~/server/repo/data-checks.repo', () => ({
  checkQ1b: (...a: unknown[]) => checkQ1b(...a),
  checkQ7: (...a: unknown[]) => checkQ7(...a),
  checkQ8: (...a: unknown[]) => checkQ8(...a),
  checkQ9: (...a: unknown[]) => checkQ9(...a),
  checkUnpostedJournals: (...a: unknown[]) => checkUnpostedJournals(...a),
}))
vi.mock('~/server/repo/settings.repo', () => ({ getMappingRow: (...a: unknown[]) => getMappingRow(...a) }))
vi.mock('~/server/services/cash-position.service', () => ({
  computeCashPosition: async () => ({ reconciliation: { inSync: true, diff: '0.00' } }),
}))
vi.mock('~/server/services/cash-flow.service', () => ({
  computeCashFlow: async () => ({ identityOk: true, drawers: [], source: 'setup' }),
}))
vi.mock('~/server/services/ap-aging.service', () => ({
  computeApAging: async () => ({ reconciliation: { inSync: true, diff: '0.00' } }),
}))
vi.mock('~/server/services/ar-aging.service', () => ({
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
    checkQ1b.mockResolvedValue({ count: 0, amount: '0.00' })
    checkQ7.mockResolvedValue(0)
    checkQ8.mockResolvedValue(0)
    checkQ9.mockResolvedValue({ count: 0, amount: '0.00' })
    checkUnpostedJournals.mockResolvedValue(0)
    getMappingRow.mockResolvedValue({ sysmainId: '1', valueprop: '{}' })
  })

  it('reports nothing when every check passes', async () => {
    expect(await computeDataChecks(filter)).toEqual([])
  })

  it('a slow or failing query check does not hide the other checks', async () => {
    checkQ7.mockRejectedValue(new Error('Query execution was interrupted'))
    checkUnpostedJournals.mockResolvedValue(3)
    const codes = (await computeDataChecks({ ...filter, asOf: '2026-10-16' })).map((c) => c.code)
    expect(codes).toContain('UNPOSTED')
    expect(codes).toContain('CHECK_FAILED')
    expect(codes).not.toContain('Q7')
  })

  it('a failed mapping read is reported as a failed check, not as a missing mapping', async () => {
    getMappingRow.mockRejectedValue(new Error('connection lost'))
    const codes = (await computeDataChecks({ ...filter, asOf: '2026-10-17' })).map((c) => c.code)
    expect(codes).toContain('CHECK_FAILED')
    expect(codes).not.toContain('SETTINGS')
  })
})
