import { describe, expect, it } from 'vitest'
import { addDays } from '~/lib/format/date'
import { D } from '../../core/money'
import type { PlanStatus } from './aging'
import { buildPaymentPlan, type ApItemForPlan } from './payment-plan'
import { apItemsFromDueTotals, arItemsFromDueTotals } from './payment-plan-aggregate'

const TODAY = '2026-06-15'

function random(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296
  }
}

function sumByDate(items: Array<{ dueDate: string; balance: string }>) {
  const map = new Map<string, string>()
  for (const i of items)
    map.set(
      i.dueDate,
      D(map.get(i.dueDate) ?? 0)
        .plus(D(i.balance))
        .toFixed(2),
    )
  return map
}

describe('payment plan from totals per due date equals the plan from every invoice', () => {
  for (const seed of [1, 2, 3, 4]) {
    it(`payables with statuses, seed ${seed}`, () => {
      const r = random(seed)
      const int = (n: number) => Math.floor(r() * n)
      const statuses: PlanStatus[] = ['approved', 'submitted', 'notSubmitted']
      const perInvoice: ApItemForPlan[] = Array.from({ length: 300 }, (_, i) => ({
        invoiceId: `i${i}`,
        dueDate: addDays(TODAY, int(60) - 20), // some overdue, some beyond the horizon
        balance: (1 + int(500_000) / 100).toFixed(2),
        status: statuses[int(3)] as PlanStatus,
      }))
      const plan = (apItems: ApItemForPlan[]) =>
        buildPaymentPlan({
          today: TODAY,
          horizon: 14,
          inflow: false,
          openingCash: '1000.00',
          apItems,
          arItems: [],
          unsettled: [],
          settlementLags: new Map(),
        })

      const inStatus = (s: PlanStatus) => perInvoice.filter((i) => i.status === s)
      const aggregated = apItemsFromDueTotals({
        total: sumByDate(perInvoice),
        approved: sumByDate(inStatus('approved')),
        submitted: sumByDate(inStatus('submitted')),
      })
      expect(plan(aggregated)).toEqual(plan(perInvoice))
    })
  }

  it('receivables', () => {
    const r = random(7)
    const int = (n: number) => Math.floor(r() * n)
    const perInvoice = Array.from({ length: 100 }, () => ({
      dueDate: addDays(TODAY, int(20)),
      balance: (1 + int(100_000) / 100).toFixed(2),
    }))
    const plan = (arItems: Array<{ dueDate: string; balance: string }>) =>
      buildPaymentPlan({
        today: TODAY,
        horizon: 7,
        inflow: true,
        openingCash: '0.00',
        apItems: [],
        arItems,
        unsettled: [],
        settlementLags: new Map(),
      })
    expect(plan(arItemsFromDueTotals(sumByDate(perInvoice)))).toEqual(plan(perInvoice))
  })

  it('leaves out zero amounts', () => {
    const items = apItemsFromDueTotals({
      total: new Map([['2026-06-16', '10.00']]),
      approved: new Map([['2026-06-16', '10.00']]),
      submitted: new Map(),
    })
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ status: 'approved', balance: '10.00' })
  })
})
