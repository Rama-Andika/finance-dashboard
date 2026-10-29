import { describe, expect, it } from 'vitest'
import { pickOpeningPeriod, combineBalances } from './balance'
import type { AccountGroup, Period } from '../../core/types'

describe('pickOpeningPeriod', () => {
  const periods: Period[] = [
    {
      periodeId: '1',
      name: 'Aug 2026',
      startDate: '2026-08-01',
      endDate: '2026-08-31',
      status: 'Closed',
      type: 0,
      tableName: 'gl',
    },
    {
      periodeId: '2',
      name: 'Sep 2026',
      startDate: '2026-09-01',
      endDate: '2026-09-30',
      status: 'Closed',
      type: 0,
      tableName: 'gl',
    },
    {
      periodeId: '3',
      name: 'Oct 2026',
      startDate: '2026-10-01',
      endDate: '2026-10-31',
      status: 'Open',
      type: 0,
      tableName: 'gl',
    },
  ]

  it('picks last Closed period before asOf as C, and next period as P*', () => {
    const { closed, opening } = pickOpeningPeriod(periods, '2026-10-28')
    expect(closed?.periodeId).toBe('2') // Sep 2026
    expect(opening?.periodeId).toBe('3') // Oct 2026
  })

  it('returns C=null and P*=earliest period when no closed periods exist before asOf', () => {
    const allOpen = periods.map((p) => ({ ...p, status: 'Open' as const }))
    const { closed, opening } = pickOpeningPeriod(allOpen, '2026-10-28')
    expect(closed).toBeNull()
    expect(opening?.periodeId).toBe('1') // Aug 2026
  })

  it('returns both null when periods array is empty', () => {
    expect(pickOpeningPeriod([], '2026-10-28')).toEqual({
      closed: null,
      opening: null,
    })
  })
})

describe('combineBalances', () => {
  it('combines opening + debet - credit for Liquid Assets', () => {
    const accounts = new Map<string, { accountGroup: AccountGroup }>([
      ['acc1', { accountGroup: 'Liquid Assets' }],
    ])
    const openings = [{ coaId: 'acc1', opening: '1000.00' }]
    const movements = [{ coaId: 'acc1', debet: '200.00', credit: '50.00' }]

    const balances = combineBalances(accounts, openings, movements)
    expect(balances.get('acc1')).toBe('1150.00')
  })

  it('combines opening + credit - debet for Current Liabilities', () => {
    const accounts = new Map<string, { accountGroup: AccountGroup }>([
      ['acc2', { accountGroup: 'Current Liabilities' }],
    ])
    const openings = [{ coaId: 'acc2', opening: '500.00' }]
    const movements = [{ coaId: 'acc2', debet: '0.00', credit: '100.00' }]

    const balances = combineBalances(accounts, openings, movements)
    expect(balances.get('acc2')).toBe('600.00')
  })

  it('returns 0.00 for accounts without opening and without movements', () => {
    const accounts = new Map<string, { accountGroup: AccountGroup }>([
      ['acc3', { accountGroup: 'Fixed Assets' }],
    ])
    const balances = combineBalances(accounts, [], [])
    expect(balances.get('acc3')).toBe('0.00')
  })
})
