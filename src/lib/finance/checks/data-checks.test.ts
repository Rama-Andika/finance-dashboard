import { describe, expect, it } from 'vitest'
import { buildDataChecks, type DataCheckInputs } from './data-checks'

const clean: DataCheckInputs = {
  cashFlow: { identityOk: true, source: 'setup', drawers: [{ rows: [{ amount: '10.00' }] }] },
  transitRegister: { count: 0, amount: '0.00' },
  cashPositionReconciliation: { inSync: true, diff: '0.00' },
  apReconciliation: { inSync: true, diff: '0.00' },
  arUnallocatedReturns: '0.00',
  paidWithoutDetail: { count: 0, amount: '0.00' },
  cardsWithoutParty: 0,
  cardsWithInvalidLocation: 0,
  unpostedJournals: 0,
  mappingRow: { valueprop: '{}' },
  failedChecks: [],
}

const codes = (over: Partial<DataCheckInputs>) => buildDataChecks({ ...clean, ...over }).map((c) => c.code)

describe('buildDataChecks', () => {
  it('reports nothing when everything is fine', () => {
    expect(buildDataChecks(clean)).toEqual([])
  })

  it('puts the cash-flow identity failure first, as a danger', () => {
    const checks = buildDataChecks({ ...clean, cashFlow: { ...clean.cashFlow!, identityOk: false }, unpostedJournals: 3 })
    expect(checks[0]).toMatchObject({ code: 'CF_IDENTITY', level: 'danger', link: '/cash-flow' })
    expect(checks.map((c) => c.code)).toEqual(['CF_IDENTITY', 'UNPOSTED'])
  })

  it('sums unclassified cash-flow rows and flags the fallback classification', () => {
    const unclassified = buildDataChecks({
      ...clean,
      cashFlow: { identityOk: true, source: 'setup', drawers: [{ rows: [{ amount: '5.50', unclassified: true }, { amount: '4.50', unclassified: true }, { amount: '9.00' }] }] },
    })
    expect(unclassified).toEqual([{ code: 'CF_UNCLASSIFIED', level: 'warning', count: 1, amount: '10.00', link: '/cash-flow' }])
    expect(codes({ cashFlow: { identityOk: true, source: 'fallback', drawers: [] } })).toEqual(['CF_UNCLASSIFIED'])
  })

  it('reports reconciliation gaps with the difference', () => {
    const checks = buildDataChecks({
      ...clean,
      cashPositionReconciliation: { inSync: false, diff: '5000.00' },
      apReconciliation: { inSync: false, diff: '-12.00' },
    })
    expect(checks.map((c) => [c.code, c.amount])).toEqual([['REC_TRANSIT', '5000.00'], ['REC_AP', '-12.00']])
  })

  it('skips sub-checks that failed and reports them once as CHECK_FAILED', () => {
    const checks = buildDataChecks({ ...clean, cashFlow: null, unpostedJournals: null, failedChecks: ['cashFlow', 'unposted'] })
    expect(checks).toEqual([{ code: 'CHECK_FAILED', level: 'warning', count: 2, amount: null, link: '/summary' }])
  })

  it('reports a missing mapping, but not when the mapping read itself failed', () => {
    expect(codes({ mappingRow: null })).toEqual(['SETTINGS'])
    expect(codes({ mappingRow: { valueprop: '' } })).toEqual(['SETTINGS'])
    expect(codes({ mappingRow: undefined, failedChecks: ['mapping'] })).toEqual(['CHECK_FAILED'])
  })
})
