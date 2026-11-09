import { CF_FALLBACK, UNCLASSIFIED_SUBGROUP } from './cashflow-labels'
import { FIXED_ASSET_JOURNAL_TYPES, LOAN_JOURNAL_TYPES } from '../journal/journal-type'
import Decimal from 'decimal.js'
import { D } from '../../core/money'
import type { Id, Money } from '../../core/types'
import type { CoaTree } from '../coa/coa-tree'

export type DrawerKey = 'OPERATING' | 'INVESTING' | 'FUNDING'

export type CfLine = {
  glId: Id
  journalType: number
  periodId: Id
  coaId: Id
  segmentDetailId: Id | null
  debet: Money
  credit: Money
}

export type AllocatedCashPortion = {
  glId: Id
  journalType: number
  periodId: Id
  counterCoaId: Id
  /** Segment (entity) detail of the counter line, when the line carries one. */
  counterSegmentId: Id | null
  portion: Money // + inflow, − outflow
}

/**
 * The cash-account test shared by every metric: a line is "ours" when its account is a cash account
 * and, when entities are filtered, its segment is one of the selected ones.
 */
export function makeIsOurCash(
  cashCoaIds: Iterable<Id>,
  segIds: Id[] | 'all',
): (l: { coaId: Id; segmentDetailId: Id | null }) => boolean {
  const cashSet = new Set(cashCoaIds)
  const segSet = segIds === 'all' ? null : new Set(segIds)
  return (l) => {
    if (!cashSet.has(l.coaId)) return false
    if (!segSet) return true
    return l.segmentDetailId !== null && segSet.has(l.segmentDetailId)
  }
}

export type CfSetupRow = {
  groupName: string
  groupSequence: number
  subGroup: string
  subSequence: number
  valueDisplayed: 0 | 1
  accountGroup: string | null
  subAccountGroup: string | null
}

export type ClassifiedPortion = {
  drawer: DrawerKey
  subGroup: string
  unclassified?: boolean
}

/** A journal that really moves our cash (see `settledJournals`). */
export type SettledJournal = {
  glId: Id
  /** Journal lines on our cash accounts */
  ourCash: CfLine[]
  /** Every other line (the counter side) */
  counterLines: CfLine[]
  /** Net movement on our cash accounts: debet − credit (+ inflow, − outflow) */
  netCash: Decimal
}

/**
 * Journals that really move our cash: they touch our cash, the net is not zero, and they have a
 * counter side (a journal with only our own cash lines is an internal transfer and is ignored).
 * Shared by the cash allocation and the ERP-method comparison so both pick the same journals.
 */
export function settledJournals(lines: readonly CfLine[], isOurCash: (l: CfLine) => boolean): SettledJournal[] {
  const byGl = new Map<Id, CfLine[]>()
  for (const l of lines) {
    const list = byGl.get(l.glId) ?? []
    list.push(l)
    byGl.set(l.glId, list)
  }

  const result: SettledJournal[] = []
  for (const [glId, journalLines] of byGl.entries()) {
    const ourCash = journalLines.filter(isOurCash)
    if (ourCash.length === 0) continue

    const netCash = ourCash.reduce((acc, c) => acc.plus(D(c.debet).minus(D(c.credit))), D(0))
    if (netCash.isZero()) continue

    const counterLines = journalLines.filter((l) => !isOurCash(l))
    if (counterLines.length === 0) continue

    result.push({ glId, ourCash, counterLines, netCash })
  }
  return result
}

/**
 * Step 1 (data-model §6.3): Allocate cash proportionally per journal.
 */
export function allocateCash(lines: CfLine[], isOurCash: (l: CfLine) => boolean): AllocatedCashPortion[] {
  return allocateJournals(settledJournals(lines, isOurCash))
}

/**
 * The same allocation for journals that `settledJournals` already picked, so a caller that needs both the journals
 * and the portions groups the lines only once.
 */
export function allocateJournals(journals: readonly SettledJournal[]): AllocatedCashPortion[] {
  const result: AllocatedCashPortion[] = []

  for (const { glId, counterLines, netCash } of journals) {
    // Weight w_i = |debet − credit|
    const weights: Decimal[] = []
    let sumW = D(0)
    for (const cl of counterLines) {
      const w = D(cl.debet).minus(D(cl.credit)).abs()
      weights.push(w)
      sumW = sumW.plus(w)
    }

    const firstLine = counterLines[0]!
    const journalType = firstLine.journalType
    const periodId = firstLine.periodId

    if (sumW.isZero()) {
      // Entire netCash goes to first counter line
      result.push({
        glId,
        journalType,
        periodId,
        counterCoaId: firstLine.coaId,
        counterSegmentId: firstLine.segmentDetailId,
        portion: netCash.toFixed(2),
      })
      continue
    }

    // Proportional allocation
    const portions: Decimal[] = []
    let portionsSum = D(0)
    let maxWeightIdx = 0
    let maxWeight = D(-1)

    for (let i = 0; i < counterLines.length; i++) {
      const w = weights[i]!
      if (w.gt(maxWeight)) {
        maxWeight = w
        maxWeightIdx = i
      }
      const rawPortion = netCash.times(w).div(sumW)
      const rounded = new Decimal(rawPortion.toFixed(2, Decimal.ROUND_HALF_UP))
      portions.push(rounded)
      portionsSum = portionsSum.plus(rounded)
    }

    // Fix rounding difference on the item with largest weight
    const diff = netCash.minus(portionsSum)
    if (!diff.isZero()) {
      portions[maxWeightIdx] = portions[maxWeightIdx]!.plus(diff)
    }

    for (let i = 0; i < counterLines.length; i++) {
      result.push({
        glId,
        journalType,
        periodId,
        counterCoaId: counterLines[i]!.coaId,
        counterSegmentId: counterLines[i]!.segmentDetailId,
        portion: portions[i]!.toFixed(2),
      })
    }
  }

  return result
}

/**
 * Step 2: Check if cash_flow_setup is valid (≥ 1 row has an accountGroup).
 */
export function isSetupValid(setup: CfSetupRow[]): boolean {
  return setup.some((r) => !!r.accountGroup)
}

function mapGroupName(groupName: string): DrawerKey {
  const upper = groupName.toUpperCase()
  if (upper.includes('INVEST')) return 'INVESTING'
  if (upper.includes('FUND') || upper.includes('FINANC') || upper.includes('PENDANAAN')) {
    return 'FUNDING'
  }
  return 'OPERATING'
}

/** One (group, sub group) of cash_flow_setup that applies to a counter account, with the directions it accepts. */
type SetupSubRow = {
  groupName: string
  groupSequence: number
  subGroup: string
  subSequence: number
  /** valueDisplayed = 0: the sub row takes inflows. */
  takesInflow: boolean
  /** valueDisplayed = 1: the sub row takes outflows. */
  takesOutflow: boolean
}

type CounterAccount = { accountGroup: string; subAccountGroup: string }

/** The setup sub rows of the counter account's group and sub group, one per (group name, sub group), in setup order. */
function setupSubRowsOf(setup: readonly CfSetupRow[], counter: CounterAccount): SetupSubRow[] {
  const subRows = new Map<string, SetupSubRow>()
  for (const r of setup) {
    if (r.accountGroup !== counter.accountGroup || r.subAccountGroup !== counter.subAccountGroup) continue
    const key = `${r.groupName}::${r.subGroup}`
    const subRow = subRows.get(key) ?? {
      groupName: r.groupName,
      groupSequence: r.groupSequence,
      subGroup: r.subGroup,
      subSequence: r.subSequence,
      takesInflow: false,
      takesOutflow: false,
    }
    if (r.valueDisplayed === 0) subRow.takesInflow = true
    if (r.valueDisplayed === 1) subRow.takesOutflow = true
    subRows.set(key, subRow)
  }
  return Array.from(subRows.values())
}

/**
 * The sub rows per counter account type, remembered per setup list: they depend only on the setup and on the account
 * group and sub group, while a period has tens of thousands of portions and only a few dozen distinct types.
 * The setup list must not be changed after it was first used (it is read-only everywhere).
 */
const subRowsCache = new WeakMap<readonly CfSetupRow[], Map<string, SetupSubRow[]>>()

function cachedSetupSubRows(setup: readonly CfSetupRow[], counter: CounterAccount): SetupSubRow[] {
  let byCounter = subRowsCache.get(setup)
  if (!byCounter) {
    byCounter = new Map()
    subRowsCache.set(setup, byCounter)
  }
  const key = `${counter.accountGroup}\u0000${counter.subAccountGroup}`
  let subRows = byCounter.get(key)
  if (!subRows) {
    subRows = setupSubRowsOf(setup, counter)
    byCounter.set(key, subRows)
  }
  return subRows
}

/** A sub row with both kinds of rows takes any portion; one kind takes only its own direction. */
function takesPortion(subRow: SetupSubRow, portion: Decimal): boolean {
  if (subRow.takesInflow && subRow.takesOutflow) return true
  if (subRow.takesOutflow) return portion.lt(0)
  if (subRow.takesInflow) return portion.gt(0)
  return false
}

/** Setup order: group sequence first, then sub sequence. */
const bySetupOrder = (a: SetupSubRow, b: SetupSubRow): number =>
  a.groupSequence !== b.groupSequence ? a.groupSequence - b.groupSequence : a.subSequence - b.subSequence

/**
 * Classify a portion using ERP cash_flow_setup table.
 */
export function classifyBySetup(
  portion: Money,
  counter: CounterAccount,
  setup: CfSetupRow[],
): ClassifiedPortion | 'UNCLASSIFIED' {
  const portionD = D(portion)
  const eligible = cachedSetupSubRows(setup, counter).filter((subRow) => takesPortion(subRow, portionD))
  if (eligible.length === 0) return 'UNCLASSIFIED'

  // The first in setup order wins; equal sequences keep setup order.
  const winner = eligible.reduce((best, subRow) => (bySetupOrder(subRow, best) < 0 ? subRow : best))
  return { drawer: mapGroupName(winner.groupName), subGroup: winner.subGroup }
}

/** A fallback rule gives the classification when it applies to the counter account, otherwise null. */
type FallbackRule = (counter: CounterAccount, portion: Decimal, journalType: number) => ClassifiedPortion | null

/** The fallback rules (§6.3) in the order they are tried: the first one that applies wins. */
const FALLBACK_RULES: readonly FallbackRule[] = [
  // 1. bank loan journals
  (_counter, _portion, journalType) =>
    LOAN_JOURNAL_TYPES.has(journalType) ? { drawer: 'FUNDING', subGroup: CF_FALLBACK.bankLoan } : null,
  // 2. fixed asset journals, or a Fixed / Other Assets counter account
  (counter, portion, journalType) =>
    FIXED_ASSET_JOURNAL_TYPES.has(journalType) || ['Fixed Assets', 'Other Assets'].includes(counter.accountGroup)
      ? { drawer: 'INVESTING', subGroup: portion.lt(0) ? CF_FALLBACK.assetPurchase : CF_FALLBACK.assetSale }
      : null,
  // 3. Equity
  (counter, portion) =>
    counter.accountGroup === 'Equity'
      ? {
          drawer: 'FUNDING',
          subGroup: portion.gt(0) ? CF_FALLBACK.capitalContribution : CF_FALLBACK.ownerDrawings,
        }
      : null,
  // 4. Long Term Liabilities
  (counter) =>
    counter.accountGroup === 'Long Term Liabilities' ? { drawer: 'FUNDING', subGroup: CF_FALLBACK.longTermLoan } : null,
  // 5. Revenue or Account Receivable
  (counter) =>
    counter.accountGroup === 'Revenue' || counter.subAccountGroup === 'Account Receivable'
      ? { drawer: 'OPERATING', subGroup: CF_FALLBACK.customerReceipts }
      : null,
  // 6. Account Payable or Inventory
  (counter) =>
    counter.subAccountGroup === 'Account Payable' || counter.subAccountGroup === 'Inventory'
      ? { drawer: 'OPERATING', subGroup: CF_FALLBACK.supplierPayments }
      : null,
  // 7. Expense, Cost Of Sales, Account Receivable Other
  (counter) =>
    ['Expense', 'Cost Of Sales'].includes(counter.accountGroup) ||
    counter.subAccountGroup === 'Account Receivable Other'
      ? { drawer: 'OPERATING', subGroup: CF_FALLBACK.operatingExpenses }
      : null,
  // 8. Other Expense
  (counter) =>
    counter.accountGroup === 'Other Expense' ? { drawer: 'OPERATING', subGroup: CF_FALLBACK.interestAndFees } : null,
  // 9. Other Revenue
  (counter) =>
    counter.accountGroup === 'Other Revenue' ? { drawer: 'OPERATING', subGroup: CF_FALLBACK.otherIncome } : null,
]

/**
 * Classify a portion using the fallback rules (§6.3); 'Unclassified' when none applies.
 */
export function classifyByFallback(portion: Money, counter: CounterAccount, journalType: number): ClassifiedPortion {
  const portionD = D(portion)
  for (const rule of FALLBACK_RULES) {
    const classified = rule(counter, portionD, journalType)
    if (classified) return classified
  }
  return { drawer: 'OPERATING', subGroup: UNCLASSIFIED_SUBGROUP, unclassified: true }
}

/**
 * Where an amount against one counter account goes: by the cash flow setup table when it is valid, otherwise by the
 * fallback rules. An amount the setup has no row for goes under Operating, flagged as unclassified.
 */
export function classifyCounterAmount(
  amount: Money,
  counter: CounterAccount,
  journalType: number,
  setupValid: boolean,
  setup: CfSetupRow[],
): ClassifiedPortion {
  if (!setupValid) return classifyByFallback(amount, counter, journalType)
  const classified = classifyBySetup(amount, counter, setup)
  if (classified === 'UNCLASSIFIED') return { drawer: 'OPERATING', subGroup: UNCLASSIFIED_SUBGROUP, unclassified: true }
  return classified
}

/** The account group and sub group of a counter account; both empty when the account is not in the chart of accounts. */
export function counterAccountOf(tree: CoaTree, coaId: Id): CounterAccount {
  const node = tree.byId.get(coaId)
  return { accountGroup: node?.accountGroup ?? '', subAccountGroup: node?.subAccountGroup ?? '' }
}
