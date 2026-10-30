import Decimal from 'decimal.js'
import { D, safeDiv } from '../../core/money'
import type { AccountGroup, Breakdown, Id, Money } from '../../core/types'
import { type CoaTree, ORPHAN_FOLDER_ID, postableDescendants } from '../coa/coa-tree'
import { groupFolders } from './revenue'
import { accountSide } from '../coa/sign'

export type PnlLineKey =
  | 'revenue'
  | 'cogs'
  | 'grossProfit'
  | 'opex'
  | 'operatingProfit'
  | 'otherRevenue'
  | 'otherExpense'
  | 'netProfit'

export type PnlLine = {
  key: PnlLineKey
  amount: Money
  /** Ratio to revenue as a decimal string (0.25 = 25%), or null when revenue is zero; the client formats it. */
  margin: string | null
  byPeriod: Record<Id, Money>
  folders: Breakdown[]
}

export type PnlMovement = {
  coaId: Id
  periodId: Id
  debet: Money
  credit: Money
}

type CoaTotals = {
  totalDebet: Decimal
  totalCredit: Decimal
  byPeriod: Map<Id, { debet: Decimal; credit: Decimal }>
}

type PnlContext = {
  tree: CoaTree
  byCoa: Map<Id, CoaTotals>
  periodIds: Id[]
}

/** One account group of the statement: the total, the amount per period and the folder breakdown. */
type LineComponent = {
  total: Decimal
  byPeriod: Record<Id, Money>
  folders: Breakdown[]
}

/** Debit and credit per account, in total and per period. */
function indexByCoa(movements: PnlMovement[]): Map<Id, CoaTotals> {
  const byCoa = new Map<Id, CoaTotals>()
  for (const m of movements) {
    let entry = byCoa.get(m.coaId)
    if (!entry) {
      entry = { totalDebet: D(0), totalCredit: D(0), byPeriod: new Map() }
      byCoa.set(m.coaId, entry)
    }

    const debet = D(m.debet)
    const credit = D(m.credit)
    entry.totalDebet = entry.totalDebet.plus(debet)
    entry.totalCredit = entry.totalCredit.plus(credit)

    const period = entry.byPeriod.get(m.periodId) ?? { debet: D(0), credit: D(0) }
    period.debet = period.debet.plus(debet)
    period.credit = period.credit.plus(credit)
    entry.byPeriod.set(m.periodId, period)
  }
  return byCoa
}

/** Total, per period and folders of one account group, signed by the group's natural side (sign.ts). */
function computeLine(ctx: PnlContext, accountGroup: AccountGroup): LineComponent {
  const { tree, byCoa, periodIds } = ctx
  const debitSide = accountSide(accountGroup) === 'debit'
  const signed = (debet: Decimal, credit: Decimal): Decimal => (debitSide ? debet.minus(credit) : credit.minus(debet))
  const netOf = (coaId: Id): Decimal => {
    const totals = byCoa.get(coaId)
    return totals ? signed(totals.totalDebet, totals.totalCredit) : D(0)
  }

  let total = D(0)
  const byPeriod = new Map<Id, Decimal>(periodIds.map((periodId) => [periodId, D(0)]))
  for (const node of tree.byId.values()) {
    if (node.status !== 'POSTABLE' || node.coaId === ORPHAN_FOLDER_ID || node.accountGroup !== accountGroup) continue
    const totals = byCoa.get(node.coaId)
    if (!totals) continue

    total = total.plus(signed(totals.totalDebet, totals.totalCredit))
    for (const [periodId, p] of totals.byPeriod) {
      byPeriod.set(periodId, (byPeriod.get(periodId) ?? D(0)).plus(signed(p.debet, p.credit)))
    }
  }

  const folders: Breakdown[] = groupFolders(tree, accountGroup).map((folder) => {
    const accountIds = folder.status === 'POSTABLE' ? [folder.coaId] : postableDescendants(tree, folder.coaId)
    const children: Breakdown[] = accountIds.map((coaId) => {
      const node = tree.byId.get(coaId)
      return { id: coaId, label: node?.name ?? `Account ${coaId}`, code: node?.code, amount: netOf(coaId).toFixed(2) }
    })
    const folderSum = accountIds.reduce((acc, coaId) => acc.plus(netOf(coaId)), D(0))
    return { id: folder.coaId, label: folder.name, code: folder.code, amount: folderSum.toFixed(2), children }
  })

  return {
    total,
    byPeriod: Object.fromEntries(Array.from(byPeriod, ([periodId, amount]) => [periodId, amount.toFixed(2)])),
    folders,
  }
}

export function buildPnl(input: {
  tree: CoaTree
  movements: PnlMovement[]
}): {
  lines: PnlLine[]
} {
  const { tree, movements } = input
  const periodIds = Array.from(new Set(movements.map((m) => m.periodId)))
  const ctx: PnlContext = { tree, byCoa: indexByCoa(movements), periodIds }

  /** The amount of every period, from the amounts of that period in the lines it is built from. */
  const perPeriod = (amountOf: (periodId: Id) => Decimal): Record<Id, Money> =>
    Object.fromEntries(periodIds.map((periodId) => [periodId, amountOf(periodId).toFixed(2)]))
  const at = (byPeriod: Record<Id, Money>, periodId: Id): Decimal => D(byPeriod[periodId] ?? '0.00')

  const revenue = computeLine(ctx, 'Revenue')
  const cogs = computeLine(ctx, 'Cost Of Sales')
  const opex = computeLine(ctx, 'Expense')
  const otherRevenue = computeLine(ctx, 'Other Revenue')
  const otherExpense = computeLine(ctx, 'Other Expense')

  // Gross profit = Revenue - COGS; operating profit = gross profit - OPEX;
  // net profit = operating profit + other revenue - other expense
  const grossProfit = revenue.total.minus(cogs.total)
  const grossProfitByPeriod = perPeriod((p) => at(revenue.byPeriod, p).minus(at(cogs.byPeriod, p)))
  const operatingProfit = grossProfit.minus(opex.total)
  const operatingProfitByPeriod = perPeriod((p) => at(grossProfitByPeriod, p).minus(at(opex.byPeriod, p)))
  const netProfit = operatingProfit.plus(otherRevenue.total).minus(otherExpense.total)
  const netProfitByPeriod = perPeriod((p) =>
    at(operatingProfitByPeriod, p).plus(at(otherRevenue.byPeriod, p)).minus(at(otherExpense.byPeriod, p)),
  )

  /** Share of revenue as a decimal ratio; null when there is no revenue. */
  const marginOf = (amount: Decimal): string | null =>
    revenue.total.isZero() ? null : safeDiv(amount.toFixed(2), revenue.total.toFixed(2)) || null

  const line = (
    key: PnlLineKey,
    amount: Decimal,
    byPeriod: Record<Id, Money>,
    opts: { folders?: Breakdown[]; margin?: boolean } = {},
  ): PnlLine => ({
    key,
    amount: amount.toFixed(2),
    margin: opts.margin ? marginOf(amount) : null,
    byPeriod,
    folders: opts.folders ?? [],
  })

  return {
    lines: [
      line('revenue', revenue.total, revenue.byPeriod, { folders: revenue.folders }),
      line('cogs', cogs.total, cogs.byPeriod, { folders: cogs.folders }),
      line('grossProfit', grossProfit, grossProfitByPeriod, { margin: true }),
      line('opex', opex.total, opex.byPeriod, { folders: opex.folders }),
      line('operatingProfit', operatingProfit, operatingProfitByPeriod, { margin: true }),
      line('otherRevenue', otherRevenue.total, otherRevenue.byPeriod, { folders: otherRevenue.folders }),
      line('otherExpense', otherExpense.total, otherExpense.byPeriod, { folders: otherExpense.folders }),
      line('netProfit', netProfit, netProfitByPeriod, { margin: true }),
    ],
  }
}
