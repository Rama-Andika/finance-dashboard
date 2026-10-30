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

type Check = (i: DataCheckInputs) => DataCheckItem | null

/** A check that only reports when a plain count of problem rows is above zero. */
function countCheck(code: string, link: string, pick: (i: DataCheckInputs) => number | null): Check {
  return (i) => {
    const count = pick(i)
    return count !== null && count > 0 ? item(code, 'warning', link, count) : null
  }
}

/** A check that reports a reconciliation that does not add up. */
function reconciliationCheck(
  code: string,
  link: string,
  pick: (i: DataCheckInputs) => { inSync: boolean; diff: Money } | null,
): Check {
  return (i) => {
    const rec = pick(i)
    return rec && !rec.inSync ? item(code, 'warning', link, 1, rec.diff) : null
  }
}

/** A check on a register of rows with a total amount (count and amount both reported). */
function registerCheck(
  code: string,
  link: string,
  pick: (i: DataCheckInputs) => { count: number; amount: Money | null } | null,
): Check {
  return (i) => {
    const register = pick(i)
    return register && register.count > 0 ? item(code, 'warning', link, register.count, register.amount) : null
  }
}

const cashFlowIdentity: Check = (i) =>
  i.cashFlow && !i.cashFlow.identityOk ? item('CF_IDENTITY', 'danger', '/cash-flow') : null

const cashFlowUnclassified: Check = (i) => {
  if (!i.cashFlow) return null
  const unclassified = unclassifiedCashFlow(i.cashFlow.drawers)
  const hasUnclassified = D(unclassified).gt(0)
  if (!hasUnclassified && i.cashFlow.source !== 'fallback') return null
  return item('CF_UNCLASSIFIED', 'warning', '/cash-flow', 1, hasUnclassified ? unclassified : null)
}

const arUnallocatedReturns: Check = (i) =>
  i.arUnallocatedReturns !== null && D(i.arUnallocatedReturns).gt(0)
    ? item('AR_UNALLOC', 'warning', '/receivables', 1, i.arUnallocatedReturns)
    : null

// A mapping read that failed is already reported as CHECK_FAILED; only report "missing" when the read worked.
const settingsMissing: Check = (i) =>
  !i.failedChecks.includes('mapping') && (!i.mappingRow || !i.mappingRow.valueprop)
    ? item('SETTINGS', 'warning', '/settings/account-mapping')
    : null

const failedChecks: Check = (i) =>
  i.failedChecks.length > 0 ? item('CHECK_FAILED', 'warning', '/summary', i.failedChecks.length) : null

/** The checks in the order the panel lists them. */
const CHECKS: readonly Check[] = [
  cashFlowIdentity,
  registerCheck('Q9', '/cash-position', (i) => i.transitRegister),
  cashFlowUnclassified,
  reconciliationCheck('REC_TRANSIT', '/cash-position', (i) => i.cashPositionReconciliation),
  reconciliationCheck('REC_AP', '/payables', (i) => i.apReconciliation),
  arUnallocatedReturns,
  registerCheck('Q1b', '/payables', (i) => i.paidWithoutDetail),
  countCheck('Q7', '/payables', (i) => i.cardsWithoutParty),
  countCheck('Q8', '/payables', (i) => i.cardsWithInvalidLocation),
  countCheck('UNPOSTED', '/summary', (i) => i.unpostedJournals),
  settingsMissing,
  failedChecks,
]

/** Turns the sub-check results into the list the Data Checks panel shows, in the order of `CHECKS`. */
export function buildDataChecks(i: DataCheckInputs): DataCheckItem[] {
  const found: DataCheckItem[] = []
  for (const check of CHECKS) {
    const result = check(i)
    if (result) found.push(result)
  }
  return found
}
