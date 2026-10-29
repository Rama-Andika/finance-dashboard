import type { AccountGroup, Id, IsoDate, Money, Period } from '../../core/types'
import { signedAmount } from '../coa/sign'
import { D } from '../../core/money'

/**
 * Pick opening period (data-model §4.5):
 * C = last type-0 Closed period with end_date < asOf.
 * P* = first type-0 period after C (or earliest type-0 period if C is null).
 */
export function pickOpeningPeriod(
  periods: Period[],
  asOf: IsoDate,
): { closed: Period | null; opening: Period | null } {
  const type0 = periods
    .filter((p) => p.type === 0)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  if (type0.length === 0) {
    return { closed: null, opening: null }
  }

  const closedCandidates = type0.filter((p) => p.status === 'Closed' && p.endDate < asOf)
  const closed = closedCandidates.length > 0 ? closedCandidates[closedCandidates.length - 1]! : null

  if (closed) {
    const idx = type0.findIndex((p) => p.periodeId === closed.periodeId)
    const opening = idx >= 0 && idx + 1 < type0.length ? type0[idx + 1]! : null
    return { closed, opening }
  }

  // If no closed period before asOf, P* is the earliest type-0 period
  return { closed: null, opening: type0[0]! }
}

/** Combine openings (already signed) + movements (signed per account group). Result: balance per coaId. */
export function combineBalances(
  accounts: Map<Id, { accountGroup: AccountGroup }>,
  openings: { coaId: Id; opening: Money }[],
  movements: { coaId: Id; debet: Money; credit: Money }[],
): Map<Id, Money> {
  const result = new Map<Id, Money>()

  // Initialize all accounts with 0.00
  for (const id of accounts.keys()) {
    result.set(id, '0.00')
  }

  // Add opening balances
  for (const o of openings) {
    const current = result.get(o.coaId) ?? '0.00'
    result.set(o.coaId, D(current).plus(D(o.opening || 0)).toFixed(2))
  }

  // Aggregate movements by coaId
  const movementSums = new Map<Id, { debet: string; credit: string }>()
  for (const m of movements) {
    const existing = movementSums.get(m.coaId)
    if (existing) {
      existing.debet = D(existing.debet).plus(D(m.debet || 0)).toFixed(2)
      existing.credit = D(existing.credit).plus(D(m.credit || 0)).toFixed(2)
    } else {
      movementSums.set(m.coaId, {
        debet: D(m.debet || 0).toFixed(2),
        credit: D(m.credit || 0).toFixed(2),
      })
    }
  }

  // Add signed movements
  for (const [coaId, m] of movementSums.entries()) {
    const acc = accounts.get(coaId)
    if (!acc) continue

    const signed = signedAmount(acc.accountGroup, m.debet, m.credit)
    const current = result.get(coaId) ?? '0.00'
    result.set(coaId, D(current).plus(D(signed)).toFixed(2))
  }

  return result
}
