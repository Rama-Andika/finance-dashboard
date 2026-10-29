import { CF_FALLBACK, UNCLASSIFIED_SUBGROUP } from './cashflow-labels'
import { FIXED_ASSET_JOURNAL_TYPES, LOAN_JOURNAL_TYPES } from '../journal/journal-type'
import Decimal from 'decimal.js'
import { D, sum } from '../../core/money'
import type { Id, Money } from '../../core/types'

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

/**
 * Step 1 (data-model §6.3): Allocate cash proportionally per journal.
 */
export function allocateCash(
  lines: CfLine[],
  isOurCash: (l: CfLine) => boolean,
): AllocatedCashPortion[] {
  // Group lines by glId
  const byGl = new Map<Id, CfLine[]>()
  for (const l of lines) {
    const list = byGl.get(l.glId) ?? []
    list.push(l)
    byGl.set(l.glId, list)
  }

  const result: AllocatedCashPortion[] = []

  for (const [glId, journalLines] of byGl.entries()) {
    const ourCashLines = journalLines.filter(isOurCash)
    if (ourCashLines.length === 0) continue

    // netCash = Σ (debet − credit) of ourCash lines (+ inflow, − outflow)
    let netCash = D(0)
    for (const cl of ourCashLines) {
      netCash = netCash.plus(D(cl.debet).minus(D(cl.credit)))
    }

    if (netCash.isZero()) continue

    const counterLines = journalLines.filter((l) => !isOurCash(l))
    if (counterLines.length === 0) {
      // Internal transfer between our cash accounts -> ignored
      continue
    }

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

/**
 * Classify a portion using ERP cash_flow_setup table.
 */
export function classifyBySetup(
  portion: Money,
  counter: { accountGroup: string; subAccountGroup: string },
  setup: CfSetupRow[],
): ClassifiedPortion | 'UNCLASSIFIED' {
  const portionD = D(portion)

  // Sub-row candidate grouping: subGroupKey -> { rows, groupName, groupSequence, subGroup, subSequence }
  const subRows = new Map<
    string,
    {
      groupName: string
      groupSequence: number
      subGroup: string
      subSequence: number
      has0: boolean
      has1: boolean
    }
  >()

  for (const r of setup) {
    if (
      r.accountGroup === counter.accountGroup &&
      r.subAccountGroup === counter.subAccountGroup
    ) {
      const key = `${r.groupName}::${r.subGroup}`
      const existing = subRows.get(key) ?? {
        groupName: r.groupName,
        groupSequence: r.groupSequence,
        subGroup: r.subGroup,
        subSequence: r.subSequence,
        has0: false,
        has1: false,
      }
      if (r.valueDisplayed === 0) existing.has0 = true
      if (r.valueDisplayed === 1) existing.has1 = true
      subRows.set(key, existing)
    }
  }

  const eligible: Array<{
    groupName: string
    groupSequence: number
    subGroup: string
    subSequence: number
  }> = []

  for (const sr of subRows.values()) {
    if (sr.has0 && sr.has1) {
      // Accepts both inflow and outflow
      eligible.push(sr)
    } else if (sr.has1 && portionD.lt(0)) {
      // ValueDisplayed = 1: Outflow only
      eligible.push(sr)
    } else if (sr.has0 && portionD.gt(0)) {
      // ValueDisplayed = 0: Inflow only
      eligible.push(sr)
    }
  }

  if (eligible.length === 0) {
    return 'UNCLASSIFIED'
  }

  // Sort by groupSequence ASC, then subSequence ASC
  eligible.sort((a, b) => {
    if (a.groupSequence !== b.groupSequence) {
      return a.groupSequence - b.groupSequence
    }
    return a.subSequence - b.subSequence
  })

  const winner = eligible[0]!
  return {
    drawer: mapGroupName(winner.groupName),
    subGroup: winner.subGroup,
  }
}

/**
 * Classify a portion using the 10 fallback rules (§6.3).
 */
export function classifyByFallback(
  portion: Money,
  counter: { accountGroup: string; subAccountGroup: string },
  journalType: number,
): ClassifiedPortion {
  const portionD = D(portion)

  // 1. journal_type in {11, 12, 13, 14}
  if (LOAN_JOURNAL_TYPES.has(journalType)) {
    return { drawer: 'FUNDING', subGroup: CF_FALLBACK.bankLoan }
  }

  // 2. journal_type in {44, 45, 49, 50, 51} or Fixed/Other Assets
  if (
    FIXED_ASSET_JOURNAL_TYPES.has(journalType) ||
    ['Fixed Assets', 'Other Assets'].includes(counter.accountGroup)
  ) {
    return {
      drawer: 'INVESTING',
      subGroup: portionD.lt(0) ? CF_FALLBACK.assetPurchase : CF_FALLBACK.assetSale,
    }
  }

  // 3. Equity
  if (counter.accountGroup === 'Equity') {
    return {
      drawer: 'FUNDING',
      subGroup:
        portionD.gt(0)
          ? CF_FALLBACK.capitalContribution
          : CF_FALLBACK.ownerDrawings,
    }
  }

  // 4. Long Term Liabilities
  if (counter.accountGroup === 'Long Term Liabilities') {
    return { drawer: 'FUNDING', subGroup: CF_FALLBACK.longTermLoan }
  }

  // 5. Revenue or Account Receivable
  if (
    counter.accountGroup === 'Revenue' ||
    counter.subAccountGroup === 'Account Receivable'
  ) {
    return { drawer: 'OPERATING', subGroup: CF_FALLBACK.customerReceipts }
  }

  // 6. Account Payable, Current Liabilities, Inventory
  if (
    counter.subAccountGroup === 'Account Payable' ||
    counter.subAccountGroup === 'Inventory'
  ) {
    return { drawer: 'OPERATING', subGroup: CF_FALLBACK.supplierPayments }
  }

  // 7. Expense, Cost Of Sales, Account Receivable Other
  if (
    ['Expense', 'Cost Of Sales'].includes(counter.accountGroup) ||
    counter.subAccountGroup === 'Account Receivable Other'
  ) {
    return {
      drawer: 'OPERATING',
      subGroup: CF_FALLBACK.operatingExpenses,
    }
  }

  // 8. Other Expense
  if (counter.accountGroup === 'Other Expense') {
    return { drawer: 'OPERATING', subGroup: CF_FALLBACK.interestAndFees }
  }

  // 9. Other Revenue
  if (counter.accountGroup === 'Other Revenue') {
    return {
      drawer: 'OPERATING',
      subGroup: CF_FALLBACK.otherIncome,
    }
  }

  // 10. Fallback unclassified
  return {
    drawer: 'OPERATING',
    subGroup: UNCLASSIFIED_SUBGROUP,
    unclassified: true,
  }
}
