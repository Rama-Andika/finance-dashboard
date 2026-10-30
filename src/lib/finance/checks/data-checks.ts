import { D } from '../../core/money'
import type { Money } from '../../core/types'

export type DataCheckItem = {
  code: string
  level: 'warning' | 'danger'
  count: number
  amount: Money | null
  link: string
}

/** What each sub-check found; `null` means the sub-check failed or was not run. */
export type DataCheckInputs = {
  cashFlow: {
    identityOk: boolean
    source: 'setup' | 'fallback'
    drawers: Array<{ rows: Array<{ amount: Money; unclassified?: boolean }> }>
  } | null
  /** In-transit register rows that are overdue or dated in the future. */
  transitRegister: { count: number; amount: Money | null } | null
  cashPositionReconciliation: { inSync: boolean; diff: Money } | null
  apReconciliation: { inSync: boolean; diff: Money } | null
  arUnallocatedReturns: Money | null
  /** Non-trade AP cards marked paid without any detail row. */
  paidWithoutDetail: { count: number; amount: Money | null } | null
  cardsWithoutParty: number | null
  cardsWithInvalidLocation: number | null
  unpostedJournals: number | null
  /** The saved mapping row; `undefined` when the read failed (reported as CHECK_FAILED instead). */
  mappingRow: { valueprop: string | null } | null | undefined
  failedChecks: readonly string[]
}

function item(code: string, level: DataCheckItem['level'], link: string, count = 1, amount: Money | null = null): DataCheckItem {
  return { code, level, count, amount, link }
}

/** Sum of the cash-flow rows that could not be classified. */
function unclassifiedCashFlow(drawers: NonNullable<DataCheckInputs['cashFlow']>['drawers']): Money {
  let total = D(0)
  for (const drawer of drawers) {
    for (const row of drawer.rows) {
      if (row.unclassified) total = total.plus(D(row.amount))
    }
  }
  return total.toFixed(2)
}

/** Turns the sub-check results into the list the Data Checks panel shows, most serious first. */
export function buildDataChecks(i: DataCheckInputs): DataCheckItem[] {
  const checks: DataCheckItem[] = []

  if (i.cashFlow && !i.cashFlow.identityOk) checks.push(item('CF_IDENTITY', 'danger', '/cash-flow'))

  if (i.transitRegister && i.transitRegister.count > 0) {
    checks.push(item('Q9', 'warning', '/cash-position', i.transitRegister.count, i.transitRegister.amount))
  }

  if (i.cashFlow) {
    const unclassified = unclassifiedCashFlow(i.cashFlow.drawers)
    if (D(unclassified).gt(0) || i.cashFlow.source === 'fallback') {
      checks.push(item('CF_UNCLASSIFIED', 'warning', '/cash-flow', 1, D(unclassified).gt(0) ? unclassified : null))
    }
  }

  if (i.cashPositionReconciliation && !i.cashPositionReconciliation.inSync) {
    checks.push(item('REC_TRANSIT', 'warning', '/cash-position', 1, i.cashPositionReconciliation.diff))
  }

  if (i.apReconciliation && !i.apReconciliation.inSync) {
    checks.push(item('REC_AP', 'warning', '/payables', 1, i.apReconciliation.diff))
  }

  if (i.arUnallocatedReturns !== null && D(i.arUnallocatedReturns).gt(0)) {
    checks.push(item('AR_UNALLOC', 'warning', '/receivables', 1, i.arUnallocatedReturns))
  }

  if (i.paidWithoutDetail && i.paidWithoutDetail.count > 0) {
    checks.push(item('Q1b', 'warning', '/payables', i.paidWithoutDetail.count, i.paidWithoutDetail.amount))
  }

  if (i.cardsWithoutParty !== null && i.cardsWithoutParty > 0) checks.push(item('Q7', 'warning', '/payables', i.cardsWithoutParty))
  if (i.cardsWithInvalidLocation !== null && i.cardsWithInvalidLocation > 0) {
    checks.push(item('Q8', 'warning', '/payables', i.cardsWithInvalidLocation))
  }
  if (i.unpostedJournals !== null && i.unpostedJournals > 0) checks.push(item('UNPOSTED', 'warning', '/summary', i.unpostedJournals))

  // A mapping read that failed is already reported as CHECK_FAILED; only report "missing" when the read worked.
  if (!i.failedChecks.includes('mapping') && (!i.mappingRow || !i.mappingRow.valueprop)) {
    checks.push(item('SETTINGS', 'warning', '/settings/account-mapping'))
  }

  if (i.failedChecks.length > 0) checks.push(item('CHECK_FAILED', 'warning', '/summary', i.failedChecks.length))

  return checks
}
