import type Decimal from 'decimal.js'
import { D } from '../../core/money'
import { isBalanceSheetGroup, PNL_ACCOUNT_GROUPS } from '../coa/account-groups'
import { PERIOD_TYPE } from '../period/period-type'
import { fiscalYearStart } from './fiscal-year'
import { byStartThenType, type BalanceSourcePlan } from './sources'
import type { BalanceTarget } from './targets'
import type { CoaTree } from '../coa/coa-tree'
import type { AccountGroup, Id, IsoDate, Money, Period } from '../../core/types'

/** ERP system properties (`system_main.name`) that hold the code of the two earnings accounts. */
export const CURRENT_EARNINGS_PROPERTY = 'CODE_LABA_TAHUN_BERJALAN'
export const PRIOR_EARNINGS_PROPERTY = 'CODE_LABA_TAHUN_LALU'

export type EarningsAccounts = {
  /** The account that holds this fiscal year's profit so far ("Laba Tahun Berjalan"); null when it cannot be found. */
  currentId: Id | null
  /** The account that holds the profit of earlier fiscal years ("Laba Tahun Lalu"); null when it cannot be found. */
  priorId: Id | null
}

/**
 * Finds the two earnings accounts in the chart of accounts from the codes the ERP stores. An account counts only when it
 * is a postable balance sheet account; two properties that point to the same account leave the prior one unresolved.
 */
export function resolveEarningsAccounts(
  tree: CoaTree,
  codes: { current: string | null; prior: string | null },
): EarningsAccounts {
  const idByCode = new Map<string, Id>()
  for (const node of tree.byId.values()) {
    if (node.status === 'POSTABLE' && node.coaId !== tree.orphanFolderId && isBalanceSheetGroup(node.accountGroup)) {
      idByCode.set(node.code, node.coaId)
    }
  }
  const find = (code: string | null): Id | null => (code ? (idByCode.get(code.trim()) ?? null) : null)
  const currentId = find(codes.current)
  const priorId = find(codes.prior)
  return { currentId, priorId: priorId !== null && priorId === currentId ? null : priorId }
}

/**
 * Profit (revenue minus expense) of every period, from the movements of the P&L accounts:
 * the sum of credit minus debit over all P&L groups (income is credit-natured, expense is debit-natured).
 */
export function profitByPeriod(
  movements: ReadonlyArray<{ coaId: Id; periodId?: Id; debet: Money; credit: Money }>,
  groupOf: (coaId: Id) => AccountGroup | undefined,
): Map<Id, Money> {
  const sums = new Map<Id, Decimal>()
  for (const m of movements) {
    if (!m.periodId) continue
    const group = groupOf(m.coaId)
    if (!group || !PNL_ACCOUNT_GROUPS.includes(group)) continue
    sums.set(m.periodId, (sums.get(m.periodId) ?? D(0)).plus(D(m.credit)).minus(D(m.debet)))
  }
  return new Map(Array.from(sums, ([periodId, sum]) => [periodId, sum.toFixed(2)]))
}

function sumProfit(periods: readonly Period[], profit: ReadonlyMap<Id, Money>): Decimal {
  return periods.reduce((acc, p) => acc.plus(D(profit.get(p.periodeId))), D(0))
}

export type EarningsPlan = {
  /** First day of the fiscal year of the report period. */
  fyStart: IsoDate
  /** Periods whose profit adds up to the fiscal year to date (method B), oldest first. */
  currentPeriods: Period[]
  /** Periods of earlier fiscal years whose profit is in no equity account yet (method B only), oldest first. */
  priorPeriods: Period[]
  /** Method A (ERP opening balance of the earnings account plus profit) needs opening balances inside this fiscal year. */
  aAvailable: boolean
}

/**
 * Which periods make up the profit lines. The ERP rolls the profit of a closed month into the opening balance of the
 * earnings account (method A). That is only right while the opening balances start inside the report's fiscal year; when
 * they start earlier (or there are none) the profit is added up from the journals instead (method B).
 */
export function planEarnings(input: {
  periods: readonly Period[]
  target: BalanceTarget
  plan: BalanceSourcePlan
  fiscalEndMonth: number
}): EarningsPlan {
  const { periods, target, plan, fiscalEndMonth } = input
  const targetStart = target.period.startDate
  const fyStart = fiscalYearStart(targetStart, fiscalEndMonth)

  const currentPeriods = periods
    .filter((p) => {
      if (p.type === PERIOD_TYPE.REGULAR) return p.startDate >= fyStart && p.startDate <= targetStart
      if (p.type === PERIOD_TYPE.PERIOD_13) {
        if (target.p13 && p.periodeId === target.p13.periodeId) return true
        return p.endDate >= fyStart && p.endDate < targetStart
      }
      return false
    })
    .sort(byStartThenType)

  const opening = plan.openingPeriod
  const aAvailable = opening !== null && opening.startDate >= fyStart

  let priorPeriods: Period[] = []
  if (!aAvailable) {
    // From the start of the fiscal year of the opening period (everything for full-history) up to this fiscal year.
    const from = opening ? fiscalYearStart(opening.startDate, fiscalEndMonth) : ''
    priorPeriods = periods
      .filter((p) => {
        if (p.type === PERIOD_TYPE.REGULAR) return p.startDate >= from && p.startDate < fyStart
        if (p.type === PERIOD_TYPE.PERIOD_13) return p.endDate >= from && p.endDate < fyStart
        return false
      })
      .sort(byStartThenType)
  }

  return { fyStart, currentPeriods, priorPeriods, aAvailable }
}

export type Earnings = {
  /** The amount of the "current year earnings" line. */
  current: Money
  /** Added to the "prior years earnings" line; zero when method A is used. */
  priorAddition: Money
  /** ERP opening balance of the earnings account plus profit; null when method A cannot be used. */
  methodA: Money | null
  /** Profit of the fiscal year to date, added up from the journals. */
  methodB: Money
  /** methodA minus methodB; null when method A cannot be used. Zero means the ERP and the journals agree. */
  difference: Money | null
  used: 'A' | 'B'
}

/**
 * The two earnings figures and which one the report uses: method A when it can be used (it equals the ERP balance
 * sheet), otherwise method B. `accountOpening` and `accountMovement` are the opening balance and the own journal
 * movements of the "current year earnings" account ('0.00' when the account does not exist).
 */
export function computeEarnings(input: {
  earningsPlan: EarningsPlan
  movementPeriods: readonly Period[]
  profit: ReadonlyMap<Id, Money>
  accountOpening: Money
  accountMovement: Money
}): Earnings {
  const { earningsPlan, movementPeriods, profit } = input
  const methodB = D(input.accountMovement).plus(sumProfit(earningsPlan.currentPeriods, profit))
  const methodA = earningsPlan.aAvailable
    ? D(input.accountOpening).plus(D(input.accountMovement)).plus(sumProfit(movementPeriods, profit))
    : null
  const used = methodA ? 'A' : 'B'
  const priorAddition = used === 'A' ? D(0) : sumProfit(earningsPlan.priorPeriods, profit)
  return {
    current: (methodA ?? methodB).toFixed(2),
    priorAddition: priorAddition.toFixed(2),
    methodA: methodA ? methodA.toFixed(2) : null,
    methodB: methodB.toFixed(2),
    difference: methodA ? methodA.minus(methodB).toFixed(2) : null,
    used,
  }
}
