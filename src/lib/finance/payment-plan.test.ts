import { describe, expect, it } from 'vitest'
import { buildPaymentPlan } from './payment-plan'
import { addDays } from '~/lib/format/date'

describe('payment plan projection engine', () => {
  const today = '2026-10-28'

  it('charges overdue AP on Day 0 and projects daily balances', () => {
    const apItems = [
      // Overdue bill (due 5 days ago)
      {
        invoiceId: 'inv_old',
        dueDate: addDays(today, -5),
        balance: '500.00',
        status: 'approved' as const,
      },
      // Bill due today (Day 0)
      {
        invoiceId: 'inv_today',
        dueDate: today,
        balance: '200.00',
        status: 'submitted' as const,
      },
      // Bill due tomorrow (Day 1)
      {
        invoiceId: 'inv_tmrw',
        dueDate: addDays(today, 1),
        balance: '300.00',
        status: 'notSubmitted' as const,
      },
    ]

    const res = buildPaymentPlan({
      today,
      horizon: 7,
      inflow: false,
      openingCash: '1000.00',
      apItems,
      arItems: [],
      unsettled: [],
      settlementLags: new Map(),
    })

    expect(res.openingBalance).toBe('1000.00')
    expect(res.overdue).toBe('500.00')
    expect(res.days).toHaveLength(7)

    // Day 0: Outflow = 500 (overdue) + 200 (today) = 700.00
    const day0 = res.days[0]!
    expect(day0.outflow).toBe('700.00')
    expect(day0.closing).toBe('300.00') // 1000 - 700
    expect(day0.status.approved).toBe('500.00')
    expect(day0.status.submitted).toBe('200.00')
    expect(day0.isNegative).toBe(false)

    // Day 1: Opening = 300.00, Outflow = 300.00 -> Closing = 0.00
    const day1 = res.days[1]!
    expect(day1.opening).toBe('300.00')
    expect(day1.outflow).toBe('300.00')
    expect(day1.closing).toBe('0.00')
    expect(day1.isNegative).toBe(false)
  })

  it('flags negative balance when outflows exceed available cash', () => {
    const apItems = [
      {
        invoiceId: 'huge_bill',
        dueDate: today,
        balance: '1500.00',
        status: 'approved' as const,
      },
    ]

    const res = buildPaymentPlan({
      today,
      horizon: 3,
      inflow: false,
      openingCash: '1000.00',
      apItems,
      arItems: [],
      unsettled: [],
      settlementLags: new Map(),
    })

    const day0 = res.days[0]!
    expect(day0.closing).toBe('-500.00')
    expect(day0.isNegative).toBe(true)
  })

  it('incorporates projected inflows and ensures estimated settlement date is never today or past', () => {
    const arItems = [
      {
        dueDate: addDays(today, 1),
        balance: '400.00',
      },
    ]

    // Old unsettled transaction with 1 day lag -> raw estimated date would be in the past!
    // It must be clamped to at least addDays(today, 1)!
    const unsettled = [
      {
        coaId: 'bank_qris',
        txDate: addDays(today, -10),
        amount: '250.00',
      },
    ]

    const settlementLags = new Map([['bank_qris', 1.2]])

    const resWithInflow = buildPaymentPlan({
      today,
      horizon: 3,
      inflow: true,
      openingCash: '1000.00',
      apItems: [],
      arItems,
      unsettled,
      settlementLags,
    })

    // Day 1 inflow = 400 (AR) + 250 (clamped unsettled) = 650.00
    const day1 = resWithInflow.days[1]!
    expect(day1.inflow).toBe('650.00')
    expect(day1.closing).toBe('1650.00')

    // Same scenario with inflow = false
    const resWithoutInflow = buildPaymentPlan({
      today,
      horizon: 3,
      inflow: false,
      openingCash: '1000.00',
      apItems: [],
      arItems,
      unsettled,
      settlementLags,
    })

    expect(resWithoutInflow.days[1]!.inflow).toBe('0.00')
    expect(resWithoutInflow.days[1]!.closing).toBe('1000.00')
  })
})
