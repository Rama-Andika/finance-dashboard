import Decimal from 'decimal.js'
import { D } from '../../core/money'
import type { Id, IsoDate, Money } from '../../core/types'
import type { PlanStatus } from './aging'

/** An open bill (balance above zero) that a credit can reduce. */
export type CreditableBill = {
  invoiceId: Id
  partyId: Id
  locationId: Id
  /** Due date, or the transaction date when there is none (YYYY-MM-DD) */
  dueDate: IsoDate
  balance: Money
}

/** The credits of one party in one entity, as a positive amount that is available to reduce bills. */
export type CreditPool = { partyId: Id; locationId: Id; amount: Money }

/** Part of one bill that a credit pays for. `amount` is positive. */
export type CreditReduction = {
  invoiceId: Id
  partyId: Id
  locationId: Id
  dueDate: IsoDate
  amount: Money
}

const poolKey = (partyId: Id, locationId: Id): string => `${partyId}|${locationId}`

function compareBills(a: CreditableBill, b: CreditableBill): number {
  if (a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1
  if (a.invoiceId !== b.invoiceId) return a.invoiceId < b.invoiceId ? -1 : 1
  return 0
}

/**
 * The credits of each (party, entity) reduce that pair's bills, earliest due date first, never by more than the
 * pair's bills add up to. Pools without a party, and amounts of zero or less, are ignored. The inputs are not changed.
 */
export function applyCredits(
  bills: readonly CreditableBill[],
  pools: readonly CreditPool[],
): { reductions: CreditReduction[]; applied: Money } {
  const available = new Map<string, Decimal>()
  for (const pool of pools) {
    if (!pool.partyId) continue
    const amount = D(pool.amount)
    if (amount.lte(0)) continue
    const key = poolKey(pool.partyId, pool.locationId)
    available.set(key, (available.get(key) ?? D(0)).plus(amount))
  }

  const byPool = new Map<string, CreditableBill[]>()
  for (const bill of bills) {
    const key = poolKey(bill.partyId, bill.locationId)
    if (!available.has(key) || D(bill.balance).lte(0)) continue
    const list = byPool.get(key) ?? []
    list.push(bill)
    byPool.set(key, list)
  }

  const reductions: CreditReduction[] = []
  let applied = D(0)
  for (const [key, list] of byPool) {
    let left = available.get(key) ?? D(0)
    for (const bill of [...list].sort(compareBills)) {
      if (left.lte(0)) break
      const take = Decimal.min(left, D(bill.balance))
      reductions.push({
        invoiceId: bill.invoiceId,
        partyId: bill.partyId,
        locationId: bill.locationId,
        dueDate: bill.dueDate,
        amount: take.toFixed(2),
      })
      left = left.minus(take)
      applied = applied.plus(take)
    }
  }
  return { reductions, applied: applied.toFixed(2) }
}

/** The pools of a list of open items: for each (party, entity) the sum of the balances below zero, as a positive amount. */
export function creditPoolsFromItems(
  items: ReadonlyArray<{ partyId: Id; locationId: Id; balance: Money }>,
): CreditPool[] {
  const pools = new Map<string, { partyId: Id; locationId: Id; amount: Decimal }>()
  for (const item of items) {
    const balance = D(item.balance)
    if (!item.partyId || !balance.lt(0)) continue
    const key = poolKey(item.partyId, item.locationId)
    const pool = pools.get(key) ?? { partyId: item.partyId, locationId: item.locationId, amount: D(0) }
    pool.amount = pool.amount.plus(balance.negated())
    pools.set(key, pool)
  }
  return Array.from(pools.values(), (p) => ({
    partyId: p.partyId,
    locationId: p.locationId,
    amount: p.amount.toFixed(2),
  }))
}

/** Bills summed per due date, in total and for the two plan statuses (what the database gives the Payment Plan summary). */
export type DueTotals = {
  total: Map<IsoDate, Money>
  approved: Map<IsoDate, Money>
  submitted: Map<IsoDate, Money>
}

/** The same totals after taking the reductions off: the due date of the bill, and its status when it has one. Inputs are not changed. */
export function subtractReductions(
  totals: DueTotals,
  reductions: readonly CreditReduction[],
  statusOf: (invoiceId: Id) => PlanStatus,
): DueTotals {
  const total = new Map(totals.total)
  const approved = new Map(totals.approved)
  const submitted = new Map(totals.submitted)
  const take = (map: Map<IsoDate, Money>, day: IsoDate, amount: Money): void => {
    map.set(
      day,
      D(map.get(day) ?? 0)
        .minus(D(amount))
        .toFixed(2),
    )
  }
  for (const r of reductions) {
    take(total, r.dueDate, r.amount)
    const status = statusOf(r.invoiceId)
    if (status === 'approved') take(approved, r.dueDate, r.amount)
    else if (status === 'submitted') take(submitted, r.dueDate, r.amount)
  }
  return { total, approved, submitted }
}
