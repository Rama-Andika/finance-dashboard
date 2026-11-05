import Decimal from 'decimal.js'
import { D } from '../../core/money'
import type { IsoDate, Money } from '../../core/types'
import type { PlanStatus } from './aging'
import type { ApItemForPlan, ArItemForPlan } from './payment-plan'

/**
 * `buildPaymentPlan` only ever adds up balances per due date and per plan status. Bills summed per (due date, status)
 * therefore give exactly the plan one entry per invoice gives (payment-plan-aggregate.test.ts shows it).
 * `total` is every open bill per due date; `approved` and `submitted` are the parts of it that belong to bills with a
 * live payment voucher of that kind; what is left is "not submitted".
 */
export function apItemsFromDueTotals(input: {
  total: Map<IsoDate, Money>
  approved: Map<IsoDate, Money>
  submitted: Map<IsoDate, Money>
}): ApItemForPlan[] {
  const items: ApItemForPlan[] = []
  for (const [dueDate, totalText] of input.total) {
    const approved = D(input.approved.get(dueDate) ?? 0)
    const submitted = D(input.submitted.get(dueDate) ?? 0)
    const notSubmitted = D(totalText).minus(approved).minus(submitted)
    const add = (status: PlanStatus, amount: Decimal) => {
      if (amount.gt(0))
        items.push({
          invoiceId: `due:${dueDate}:${status}`,
          dueDate,
          balance: amount.toFixed(2),
          status,
        })
    }
    add('approved', approved)
    add('submitted', submitted)
    add('notSubmitted', notSubmitted)
  }
  return items
}

/** Open receivables summed per due date, as entries the plan understands. */
export function arItemsFromDueTotals(total: Map<IsoDate, Money>): ArItemForPlan[] {
  return Array.from(total, ([dueDate, balance]) => ({ dueDate, balance })).filter((item) => D(item.balance).gt(0))
}
