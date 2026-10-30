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

export function buildPnl(input: {
  tree: CoaTree
  movements: PnlMovement[]
}): {
  lines: PnlLine[]
} {
  const { tree, movements } = input

  // Identify all distinct periods in movements
  const allPeriodIds = Array.from(new Set(movements.map((m) => m.periodId)))

  // Index movements by coaId and periodId
  // coaId -> { totalDebet, totalCredit, byPeriod: Map<periodId, { debet, credit }> }
  const byCoa = new Map<
    Id,
    {
      totalDebet: Decimal
      totalCredit: Decimal
      byPeriod: Map<Id, { debet: Decimal; credit: Decimal }>
    }
  >()

  for (const m of movements) {
    let entry = byCoa.get(m.coaId)
    if (!entry) {
      entry = {
        totalDebet: D(0),
        totalCredit: D(0),
        byPeriod: new Map(),
      }
      byCoa.set(m.coaId, entry)
    }

    const d = D(m.debet)
    const c = D(m.credit)
    entry.totalDebet = entry.totalDebet.plus(d)
    entry.totalCredit = entry.totalCredit.plus(c)

    const pEntry = entry.byPeriod.get(m.periodId) ?? { debet: D(0), credit: D(0) }
    pEntry.debet = pEntry.debet.plus(d)
    pEntry.credit = pEntry.credit.plus(c)
    entry.byPeriod.set(m.periodId, pEntry)
  }

  // Helper to compute line data for a set of coaIds, signed by the account group's natural side (sign.ts)
  function computeLine(
    accountGroup: AccountGroup,
    filterCoa?: (coaId: Id) => boolean,
  ): {
    total: Decimal
    byPeriod: Record<Id, Money>
    folders: Breakdown[]
  } {
    const debitSide = accountSide(accountGroup) === 'debit'
    const signed = (debet: Decimal, credit: Decimal): Decimal => (debitSide ? debet.minus(credit) : credit.minus(debet))
    // 1. Determine target accounts
    const targetCoaIds: Id[] = []
    for (const node of tree.byId.values()) {
      if (node.status !== 'POSTABLE' || node.coaId === ORPHAN_FOLDER_ID) continue
      if (node.accountGroup === accountGroup && (!filterCoa || filterCoa(node.coaId))) {
        targetCoaIds.push(node.coaId)
      }
    }

    let lineTotal = D(0)
    const lineByPeriod: Record<Id, Decimal> = {}
    for (const pId of allPeriodIds) {
      lineByPeriod[pId] = D(0)
    }

    for (const coaId of targetCoaIds) {
      const coaData = byCoa.get(coaId)
      if (!coaData) continue

      const net = signed(coaData.totalDebet, coaData.totalCredit)

      lineTotal = lineTotal.plus(net)

      for (const pId of allPeriodIds) {
        const pData = coaData.byPeriod.get(pId)
        if (pData) {
          const pNet = signed(pData.debet, pData.credit)
          lineByPeriod[pId] = lineByPeriod[pId]!.plus(pNet)
        }
      }
    }

    // Breakdown folders
    const folders: Breakdown[] = groupFolders(tree, accountGroup).map((f) => {
      const descs = f.status === 'POSTABLE' ? [f.coaId] : postableDescendants(tree, f.coaId)
      const validDescs = descs.filter((id) => !filterCoa || filterCoa(id))

      let folderSum = D(0)
      const children: Breakdown[] = []

      for (const coaId of validDescs) {
        const node = tree.byId.get(coaId)
        const cData = byCoa.get(coaId)
        const net = cData ? signed(cData.totalDebet, cData.totalCredit) : D(0)

        folderSum = folderSum.plus(net)
        children.push({
          id: coaId,
          label: node?.name ?? `Account ${coaId}`,
          code: node?.code,
          amount: net.toFixed(2),
        })
      }

      return {
        id: f.coaId,
        label: f.name,
        code: f.code,
        amount: folderSum.toFixed(2),
        children,
      }
    })

    const byPeriodFormatted: Record<Id, Money> = {}
    for (const [pId, dec] of Object.entries(lineByPeriod)) {
      byPeriodFormatted[pId] = dec.toFixed(2)
    }

    return {
      total: lineTotal,
      byPeriod: byPeriodFormatted,
      folders,
    }
  }

  // Compute components
  const revenueComp = computeLine('Revenue')
  const cogsComp = computeLine('Cost Of Sales')

  // Gross profit = Revenue - COGS
  const grossProfitTotal = revenueComp.total.minus(cogsComp.total)
  const grossProfitByPeriod: Record<Id, Money> = {}
  for (const pId of allPeriodIds) {
    const revP = D(revenueComp.byPeriod[pId] ?? '0.00')
    const cogsP = D(cogsComp.byPeriod[pId] ?? '0.00')
    grossProfitByPeriod[pId] = revP.minus(cogsP).toFixed(2)
  }

  const opexComp = computeLine('Expense')

  // Operating profit = Gross profit - OPEX
  const opProfitTotal = grossProfitTotal.minus(opexComp.total)
  const opProfitByPeriod: Record<Id, Money> = {}
  for (const pId of allPeriodIds) {
    const gpP = D(grossProfitByPeriod[pId] ?? '0.00')
    const opexP = D(opexComp.byPeriod[pId] ?? '0.00')
    opProfitByPeriod[pId] = gpP.minus(opexP).toFixed(2)
  }

  const otherRevComp = computeLine('Other Revenue')
  const otherExpComp = computeLine('Other Expense')

  // Net profit = Operating profit + Other revenue - Other expense
  const netProfitTotal = opProfitTotal
    .plus(otherRevComp.total)
    .minus(otherExpComp.total)
  const netProfitByPeriod: Record<Id, Money> = {}
  for (const pId of allPeriodIds) {
    const opP = D(opProfitByPeriod[pId] ?? '0.00')
    const oRevP = D(otherRevComp.byPeriod[pId] ?? '0.00')
    const oExpP = D(otherExpComp.byPeriod[pId] ?? '0.00')
    netProfitByPeriod[pId] = opP.plus(oRevP).minus(oExpP).toFixed(2)
  }

  // Margin helper
  function calcMargin(amt: Decimal): string | null {
    if (revenueComp.total.isZero()) return null
    const ratio = safeDiv(amt.toFixed(2), revenueComp.total.toFixed(2))
    if (!ratio) return null
    return ratio
  }

  const lines: PnlLine[] = [
    {
      key: 'revenue',
      amount: revenueComp.total.toFixed(2),
      margin: null,
      byPeriod: revenueComp.byPeriod,
      folders: revenueComp.folders,
    },
    {
      key: 'cogs',
      amount: cogsComp.total.toFixed(2),
      margin: null,
      byPeriod: cogsComp.byPeriod,
      folders: cogsComp.folders,
    },
    {
      key: 'grossProfit',
      amount: grossProfitTotal.toFixed(2),
      margin: calcMargin(grossProfitTotal),
      byPeriod: grossProfitByPeriod,
      folders: [],
    },
    {
      key: 'opex',
      amount: opexComp.total.toFixed(2),
      margin: null,
      byPeriod: opexComp.byPeriod,
      folders: opexComp.folders,
    },
    {
      key: 'operatingProfit',
      amount: opProfitTotal.toFixed(2),
      margin: calcMargin(opProfitTotal),
      byPeriod: opProfitByPeriod,
      folders: [],
    },
    {
      key: 'otherRevenue',
      amount: otherRevComp.total.toFixed(2),
      margin: null,
      byPeriod: otherRevComp.byPeriod,
      folders: otherRevComp.folders,
    },
    {
      key: 'otherExpense',
      amount: otherExpComp.total.toFixed(2),
      margin: null,
      byPeriod: otherExpComp.byPeriod,
      folders: otherExpComp.folders,
    },
    {
      key: 'netProfit',
      amount: netProfitTotal.toFixed(2),
      margin: calcMargin(netProfitTotal),
      byPeriod: netProfitByPeriod,
      folders: [],
    },
  ]

  return { lines }
}
