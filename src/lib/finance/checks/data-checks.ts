import { D } from '../../core/money'
import type { Money } from '../../core/types'

export type DataCheckItem = {
  code: string
  level: 'warning' | 'danger' | 'info'
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
  /** Customer payments (AR type 1) with no detail row: the ERP AR Aging report ignores them, so Receivables does not count them. */
  arPaymentsWithoutAllocation: { count: number; amount: Money | null } | null
  /** Direct returns (AP and AR) that no payment has used yet; open credits that wait for a payment. */
  directReturnsOpen: { count: number; amount: Money | null } | null
  /** Non-trade AP cards marked paid without any detail row. */
  paidWithoutDetail: { count: number; amount: Money | null } | null
  cardsWithoutParty: number | null
  cardsWithInvalidLocation: number | null
  unpostedJournals: number | null
  /** What the Balance Sheet found; null when it could not be computed or has no report period. */
  balanceSheet: {
    /** Assets minus liabilities and equity; zero when the balance sheet balances. */
    difference: Money
    /** The ERP earnings account minus the profit added up from the journals; null when they could not be compared. */
    earningsDifference: Money | null
    /** The ERP earnings accounts (current and prior years) are not both in the chart of accounts. */
    earningsAccountsMissing: boolean
    /** The company record has no usable last month of the fiscal year, so December was assumed. */
    fiscalMonthAssumed: boolean
  } | null
  /** The saved mapping row; `undefined` when the read failed (reported as CHECK_FAILED instead). */
  mappingRow: { valueprop: string | null } | null | undefined
  failedChecks: readonly string[]
}

function item(
  code: string,
  level: DataCheckItem['level'],
  link: string,
  count = 1,
  amount: Money | null = null,
): DataCheckItem {
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

// The Balance Sheet checks: a sheet that does not balance is serious; the others explain why it may be off.
const balanceSheetUnbalanced: Check = (i) =>
  i.balanceSheet && !D(i.balanceSheet.difference).isZero()
    ? item('BS_UNBALANCED', 'danger', '/balance-sheet', 1, i.balanceSheet.difference)
    : null

const balanceSheetEarningsMismatch: Check = (i) => {
  const difference = i.balanceSheet?.earningsDifference
  return difference && !D(difference).isZero()
    ? item('BS_EARNINGS_MISMATCH', 'warning', '/balance-sheet', 1, difference)
    : null
}

const balanceSheetEarningsAccounts: Check = (i) =>
  i.balanceSheet?.earningsAccountsMissing ? item('BS_EARNINGS_ACCOUNT_MISSING', 'warning', '/balance-sheet') : null

const balanceSheetFiscalMonth: Check = (i) =>
  i.balanceSheet?.fiscalMonthAssumed ? item('BS_FISCAL_MONTH_ASSUMED', 'warning', '/balance-sheet') : null

const arPaymentsUnallocated = registerCheck('AR_PAYMENT_UNALLOC', '/receivables', (i) => i.arPaymentsWithoutAllocation)

// Direct returns wait for the next payment, so this is information, not a warning.
const directReturnsOpen: Check = (i) =>
  i.directReturnsOpen && i.directReturnsOpen.count > 0
    ? item('DIRECT_RETURN_OPEN', 'info', '/payables', i.directReturnsOpen.count, i.directReturnsOpen.amount)
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
  registerCheck('TRANSIT_OVERDUE', '/cash-position', (i) => i.transitRegister),
  cashFlowUnclassified,
  reconciliationCheck('REC_TRANSIT', '/cash-position', (i) => i.cashPositionReconciliation),
  reconciliationCheck('REC_AP', '/payables', (i) => i.apReconciliation),
  balanceSheetUnbalanced,
  balanceSheetEarningsMismatch,
  balanceSheetEarningsAccounts,
  balanceSheetFiscalMonth,
  arPaymentsUnallocated,
  registerCheck('AP_PAID_NO_PAYMENT', '/payables', (i) => i.paidWithoutDetail),
  countCheck('CARD_PARTY_MISSING', '/payables', (i) => i.cardsWithoutParty),
  countCheck('CARD_LOCATION_INVALID', '/payables', (i) => i.cardsWithInvalidLocation),
  countCheck('UNPOSTED', '/summary', (i) => i.unpostedJournals),
  settingsMissing,
  failedChecks,
  directReturnsOpen,
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
