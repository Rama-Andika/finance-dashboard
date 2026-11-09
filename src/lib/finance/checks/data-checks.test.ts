import { describe, expect, it } from 'vitest'
import { buildDataChecks, type DataCheckInputs } from './data-checks'

const clean: DataCheckInputs = {
  cashFlow: { identityOk: true, source: 'setup', drawers: [{ rows: [{ amount: '10.00' }] }] },
  transitRegister: { count: 0, amount: '0.00' },
  cashPositionReconciliation: { inSync: true, diff: '0.00' },
  apReconciliation: { inSync: true, diff: '0.00' },
  arPaymentsWithoutAllocation: { count: 0, amount: '0.00' },
  directReturnsOpen: { count: 0, amount: '0.00' },
  paidWithoutDetail: { count: 0, amount: '0.00' },
  cardsWithoutParty: 0,
  cardsWithInvalidLocation: 0,
  unpostedJournals: 0,
  balanceSheet: {
    difference: '0.00',
    earningsDifference: '0.00',
    earningsAccountsMissing: false,
    fiscalMonthAssumed: false,
  },
  mappingRow: { valueprop: '{}' },
  failedChecks: [],
}

const codes = (over: Partial<DataCheckInputs>) => buildDataChecks({ ...clean, ...over }).map((c) => c.code)

describe('buildDataChecks', () => {
  it('reports nothing when everything is fine', () => {
    expect(buildDataChecks(clean)).toEqual([])
  })

  it('puts the cash-flow identity failure first, as a danger', () => {
    const checks = buildDataChecks({
      ...clean,
      cashFlow: { ...clean.cashFlow!, identityOk: false },
      unpostedJournals: 3,
    })
    expect(checks[0]).toMatchObject({ code: 'CF_IDENTITY', level: 'danger', link: '/cash-flow' })
    expect(checks.map((c) => c.code)).toEqual(['CF_IDENTITY', 'UNPOSTED'])
  })

  it('sums unclassified cash-flow rows and flags the fallback classification', () => {
    const unclassified = buildDataChecks({
      ...clean,
      cashFlow: {
        identityOk: true,
        source: 'setup',
        drawers: [
          {
            rows: [{ amount: '5.50', unclassified: true }, { amount: '4.50', unclassified: true }, { amount: '9.00' }],
          },
        ],
      },
    })
    expect(unclassified).toEqual([
      { code: 'CF_UNCLASSIFIED', level: 'warning', count: 1, amount: '10.00', link: '/cash-flow' },
    ])
    expect(codes({ cashFlow: { identityOk: true, source: 'fallback', drawers: [] } })).toEqual(['CF_UNCLASSIFIED'])
  })

  it('reports reconciliation gaps with the difference', () => {
    const checks = buildDataChecks({
      ...clean,
      cashPositionReconciliation: { inSync: false, diff: '5000.00' },
      apReconciliation: { inSync: false, diff: '-12.00' },
    })
    expect(checks.map((c) => [c.code, c.amount])).toEqual([
      ['REC_TRANSIT', '5000.00'],
      ['REC_AP', '-12.00'],
    ])
  })

  it('reports a balance sheet that does not balance as a danger, with the difference', () => {
    const checks = buildDataChecks({ ...clean, balanceSheet: { ...clean.balanceSheet!, difference: '-5.00' } })
    expect(checks).toEqual([
      { code: 'BS_UNBALANCED', level: 'danger', count: 1, amount: '-5.00', link: '/balance-sheet' },
    ])
  })

  it('reports earnings that differ from the journals, missing earnings accounts and an assumed fiscal year end', () => {
    expect(
      buildDataChecks({ ...clean, balanceSheet: { ...clean.balanceSheet!, earningsDifference: '-5.00' } }),
    ).toEqual([{ code: 'BS_EARNINGS_MISMATCH', level: 'warning', count: 1, amount: '-5.00', link: '/balance-sheet' }])
    expect(codes({ balanceSheet: { ...clean.balanceSheet!, earningsAccountsMissing: true } })).toEqual([
      'BS_EARNINGS_ACCOUNT_MISSING',
    ])
    expect(codes({ balanceSheet: { ...clean.balanceSheet!, fiscalMonthAssumed: true } })).toEqual([
      'BS_FISCAL_MONTH_ASSUMED',
    ])
  })

  it('does not report the balance sheet checks when there is no balance sheet or no comparison of the earnings', () => {
    expect(codes({ balanceSheet: null })).toEqual([])
    expect(codes({ balanceSheet: { ...clean.balanceSheet!, earningsDifference: null } })).toEqual([])
  })

  it('lists the balance sheet checks after the reconciliation checks and before the AR payment check', () => {
    expect(
      codes({
        apReconciliation: { inSync: false, diff: '1.00' },
        arPaymentsWithoutAllocation: { count: 1, amount: '1.00' },
        balanceSheet: {
          difference: '2.00',
          earningsDifference: '3.00',
          earningsAccountsMissing: true,
          fiscalMonthAssumed: true,
        },
      }),
    ).toEqual([
      'REC_AP',
      'BS_UNBALANCED',
      'BS_EARNINGS_MISMATCH',
      'BS_EARNINGS_ACCOUNT_MISSING',
      'BS_FISCAL_MONTH_ASSUMED',
      'AR_PAYMENT_UNALLOC',
    ])
  })

  it('reports AR payments without allocation as a warning', () => {
    const checks = buildDataChecks({
      ...clean,
      arPaymentsWithoutAllocation: { count: 2, amount: '300.00' },
    })
    expect(checks).toEqual([
      { code: 'AR_PAYMENT_UNALLOC', level: 'warning', count: 2, amount: '300.00', link: '/receivables' },
    ])
  })

  it('reports direct returns open as info, placed last after other warnings', () => {
    const checks = buildDataChecks({
      ...clean,
      unpostedJournals: 1,
      directReturnsOpen: { count: 3, amount: '-120.00' },
    })
    expect(checks.map((c) => c.code)).toEqual(['UNPOSTED', 'DIRECT_RETURN_OPEN'])
    expect(checks.find((c) => c.code === 'DIRECT_RETURN_OPEN')).toEqual({
      code: 'DIRECT_RETURN_OPEN',
      level: 'info',
      count: 3,
      amount: '-120.00',
      link: '/payables',
    })
  })

  it('reports nothing when direct returns open is null or count 0', () => {
    expect(codes({ directReturnsOpen: null })).toEqual([])
    expect(codes({ directReturnsOpen: { count: 0, amount: '0.00' } })).toEqual([])
  })

  it('skips sub-checks that failed and reports them once as CHECK_FAILED', () => {
    const checks = buildDataChecks({
      ...clean,
      cashFlow: null,
      unpostedJournals: null,
      failedChecks: ['cashFlow', 'unposted'],
    })
    expect(checks).toEqual([{ code: 'CHECK_FAILED', level: 'warning', count: 2, amount: null, link: '/summary' }])
  })

  it('reports a missing mapping, but not when the mapping read itself failed', () => {
    expect(codes({ mappingRow: null })).toEqual(['SETTINGS'])
    expect(codes({ mappingRow: { valueprop: '' } })).toEqual(['SETTINGS'])
    expect(codes({ mappingRow: undefined, failedChecks: ['mapping'] })).toEqual(['CHECK_FAILED'])
  })
})
