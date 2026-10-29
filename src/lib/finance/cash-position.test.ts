import { describe, expect, it } from 'vitest'
import {
  computeCashTotals,
  reconcileInTransit,
  computeInTransitDetail,
  buildCashPositionBreakdown,
} from './cash-position'
import { buildCoaTree } from './coa-tree'
import { mockCoaRows } from '../../../tests/fixtures/coa.fixture'

describe('cash-position pure logic', () => {
  it('calculates totals correctly with decimal precision', () => {
    const res = computeCashTotals(
      ['100.50', '200.25'],
      ['500.00', '49.25'],
      ['1000.00'],
      ['50.00'],
    )

    expect(res.cash).toBe('300.75')
    expect(res.bank).toBe('549.25')
    expect(res.cashPosition).toBe('850.00')
    expect(res.deposit).toBe('1000.00')
    expect(res.inTransit).toBe('50.00')
  })

  it('reconciles in-transit balances and detects sync differences under Rp1', () => {
    const syncRes = reconcileInTransit('500.25', '500.00')
    expect(syncRes.diff).toBe('0.25')
    expect(syncRes.inSync).toBe(true)

    const outOfSyncRes = reconcileInTransit('500.00', '498.50')
    expect(outOfSyncRes.diff).toBe('1.50')
    expect(outOfSyncRes.inSync).toBe(false)
  })

  it('computes in-transit detail per channel with aging and flags > 3 days', () => {
    const tree = buildCoaTree(mockCoaRows)
    const inTransitCoaId = '504404509311573862' // Kas Operasional

    const unsettled = [
      {
        coaId: inTransitCoaId,
        segmentDetailId: '101',
        txDate: '2026-10-24', // 4 days old relative to 2026-10-28
        n: 2,
        amount: '150.00',
      },
      {
        coaId: inTransitCoaId,
        segmentDetailId: '101',
        txDate: '2026-10-27', // 1 day old
        n: 1,
        amount: '50.00',
      },
    ]

    const detail = computeInTransitDetail({
      inTransitCoaIds: [inTransitCoaId],
      tree,
      unsettled,
      today: '2026-10-28',
    })

    expect(detail).toHaveLength(1)
    const firstDetail = detail[0]!
    expect(firstDetail.amount).toBe('200.00')
    expect(firstDetail.count).toBe(3)
    expect(firstDetail.oldestAgeDays).toBe(4)
    expect(firstDetail.overThreeDays).toBe(true)
  })

  it('builds category and folder hierarchy for cash and bank breakdown', () => {
    const tree = buildCoaTree(mockCoaRows)
    const cashId = '504404509311573862' // Kas Operasional under 1-1000
    const bankId = '504404509311573863' // Bank Mandiri under 1-1000

    const balances = new Map([
      [cashId, '250.00'],
      [bankId, '750.00'],
    ])

    const breakdown = buildCashPositionBreakdown(tree, [cashId], [bankId], balances)
    expect(breakdown).toHaveLength(2)

    const cash = breakdown[0]!
    expect(cash.id).toBe('cash')
    expect(cash.amount).toBe('250.00')
    const folder = cash.children?.[0]!
    expect(folder.label).toBe('Kas & Setara Kas')
    expect(folder.children?.[0]!.amount).toBe('250.00')

    const bank = breakdown[1]!
    expect(bank.id).toBe('bank')
    expect(bank.amount).toBe('750.00')
  })
})
