import Decimal from 'decimal.js'
import { D, sum } from './money'
import type { Id, Money } from './types'

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
  portion: Money // + inflow, − outflow
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

    // netKas = Σ (debet − credit) of ourCash lines (+ inflow, − outflow)
    let netKas = D(0)
    for (const cl of ourCashLines) {
      netKas = netKas.plus(D(cl.debet).minus(D(cl.credit)))
    }

    if (netKas.isZero()) continue

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
      // Entire netKas goes to first counter line
      result.push({
        glId,
        journalType,
        periodId,
        counterCoaId: firstLine.coaId,
        portion: netKas.toFixed(2),
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
      const rawPortion = netKas.times(w).div(sumW)
      const rounded = new Decimal(rawPortion.toFixed(2, Decimal.ROUND_HALF_UP))
      portions.push(rounded)
      portionsSum = portionsSum.plus(rounded)
    }

    // Fix rounding difference on the item with largest weight
    const diff = netKas.minus(portionsSum)
    if (!diff.isZero()) {
      portions[maxWeightIdx] = portions[maxWeightIdx]!.plus(diff)
    }

    for (let i = 0; i < counterLines.length; i++) {
      result.push({
        glId,
        journalType,
        periodId,
        counterCoaId: counterLines[i]!.coaId,
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
  if ([11, 12, 13, 14].includes(journalType)) {
    return { drawer: 'FUNDING', subGroup: 'Pinjaman bank/koperasi' }
  }

  // 2. journal_type in {44, 45, 49, 50, 51} or Fixed/Other Assets
  if (
    [44, 45, 49, 50, 51].includes(journalType) ||
    ['Fixed Assets', 'Other Assets'].includes(counter.accountGroup)
  ) {
    return {
      drawer: 'INVESTING',
      subGroup: portionD.lt(0) ? 'Pembelian asset' : 'Penjualan asset',
    }
  }

  // 3. Equity
  if (counter.accountGroup === 'Equity') {
    return {
      drawer: 'FUNDING',
      subGroup:
        portionD.gt(0)
          ? 'Setoran modal'
          : 'Pengambilan prive / Pembagian dividen',
    }
  }

  // 4. Long Term Liabilities
  if (counter.accountGroup === 'Long Term Liabilities') {
    return { drawer: 'FUNDING', subGroup: 'Pinjaman jangka panjang' }
  }

  // 5. Revenue or Account Receivable
  if (
    counter.accountGroup === 'Revenue' ||
    counter.subAccountGroup === 'Account Receivable'
  ) {
    return { drawer: 'OPERATING', subGroup: 'Penerimaan dari pelanggan' }
  }

  // 6. Account Payable, Current Liabilities, Inventory
  if (
    counter.subAccountGroup === 'Account Payable' ||
    counter.subAccountGroup === 'Current Liabilities' ||
    counter.accountGroup === 'Current Liabilities' ||
    counter.subAccountGroup === 'Inventory'
  ) {
    return { drawer: 'OPERATING', subGroup: 'Pembayaran ke supplier' }
  }

  // 7. Expense, Cost Of Sales, Account Receivable Other
  if (
    ['Expense', 'Cost Of Sales'].includes(counter.accountGroup) ||
    counter.subAccountGroup === 'Account Receivable Other'
  ) {
    return {
      drawer: 'OPERATING',
      subGroup: 'Pembayaran biaya operasional dan karyawan',
    }
  }

  // 8. Other Expense
  if (counter.accountGroup === 'Other Expense') {
    return { drawer: 'OPERATING', subGroup: 'Pembayaran bunga dan administrasi' }
  }

  // 9. Other Revenue
  if (counter.accountGroup === 'Other Revenue') {
    return {
      drawer: 'OPERATING',
      subGroup: 'Penerimaan dari jasa giro dan pendapatan lain-lain',
    }
  }

  // 10. Fallback unclassified
  return {
    drawer: 'OPERATING',
    subGroup: 'Belum terklasifikasi',
    unclassified: true,
  }
}
