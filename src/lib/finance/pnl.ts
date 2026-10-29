import Decimal from 'decimal.js'
import { D, safeDiv } from './money'
import { formatPercent } from '~/lib/format/number'
import type { AccountGroup, Breakdown, Id, Money } from './types'
import { type CoaTree, type CoaNode, postableDescendants } from './coa-tree'
import { groupFolders } from './revenue'

export type PnlLineKey =
  | 'revenue'
  | 'cogs'
  | 'grossProfit'
  | 'opex'
  | 'operatingProfit'
  | 'otherRevenue'
  | 'otherExpense'
  | 'netProfit'
  | 'oci'
  | 'comprehensiveIncome'

export type PnlLine = {
  key: PnlLineKey
  amount: Money
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

export function findOciCoaIds(tree: CoaTree, ociRootCodes: string[]): Set<Id> {
  const ociSet = new Set<Id>()
  for (const node of tree.byId.values()) {
    if (node.coaId === '__orphans__') continue
    const matchesRoot = ociRootCodes.some(
      (prefix) => node.code === prefix || node.code.startsWith(`${prefix}-`) || node.code.startsWith(prefix),
    )
    if (matchesRoot) {
      if (node.status === 'POSTABLE') {
        ociSet.add(node.coaId)
      } else {
        const descs = postableDescendants(tree, node.coaId)
        for (const d of descs) {
          ociSet.add(d)
        }
      }
    }
  }
  return ociSet
}

export function buildPnl(input: {
  tree: CoaTree
  movements: PnlMovement[]
  ociCoaIds: Set<Id>
}): {
  lines: PnlLine[]
} {
  const { tree, movements, ociCoaIds } = input

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

  // Helper to compute line data for a set of coaIds with sign orientation
  function computeLine(
    accountGroup: AccountGroup | 'OCI',
    sign: 'CREDIT_MINUS_DEBET' | 'DEBET_MINUS_CREDIT',
    filterCoa?: (coaId: Id) => boolean,
  ): {
    total: Decimal
    byPeriod: Record<Id, Money>
    folders: Breakdown[]
  } {
    // 1. Determine target accounts
    const targetCoaIds: Id[] = []
    for (const node of tree.byId.values()) {
      if (node.status !== 'POSTABLE' || node.coaId === '__orphans__') continue
      if (accountGroup === 'OCI') {
        if (ociCoaIds.has(node.coaId)) {
          targetCoaIds.push(node.coaId)
        }
      } else {
        if (node.accountGroup === accountGroup && !ociCoaIds.has(node.coaId)) {
          if (!filterCoa || filterCoa(node.coaId)) {
            targetCoaIds.push(node.coaId)
          }
        }
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

      const net =
        sign === 'CREDIT_MINUS_DEBET'
          ? coaData.totalCredit.minus(coaData.totalDebet)
          : coaData.totalDebet.minus(coaData.totalCredit)

      lineTotal = lineTotal.plus(net)

      for (const pId of allPeriodIds) {
        const pData = coaData.byPeriod.get(pId)
        if (pData) {
          const pNet =
            sign === 'CREDIT_MINUS_DEBET'
              ? pData.credit.minus(pData.debet)
              : pData.debet.minus(pData.credit)
          lineByPeriod[pId] = lineByPeriod[pId]!.plus(pNet)
        }
      }
    }

    // Breakdown folders
    let folders: Breakdown[] = []
    if (accountGroup !== 'OCI') {
      const rawFolders = groupFolders(tree, accountGroup)
      folders = rawFolders.map((f) => {
        const descs =
          f.status === 'POSTABLE' ? [f.coaId] : postableDescendants(tree, f.coaId)
        const validDescs = descs.filter(
          (id) => !ociCoaIds.has(id) && (!filterCoa || filterCoa(id)),
        )

        let folderSum = D(0)
        const children: Breakdown[] = []

        for (const coaId of validDescs) {
          const node = tree.byId.get(coaId)
          const cData = byCoa.get(coaId)
          const net = cData
            ? sign === 'CREDIT_MINUS_DEBET'
              ? cData.totalCredit.minus(cData.totalDebet)
              : cData.totalDebet.minus(cData.totalCredit)
            : D(0)

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
    } else {
      // OCI folders
      folders = targetCoaIds.map((coaId) => {
        const node = tree.byId.get(coaId)
        const cData = byCoa.get(coaId)
        const net = cData ? cData.totalCredit.minus(cData.totalDebet) : D(0)
        return {
          id: coaId,
          label: node?.name ?? `Account ${coaId}`,
          code: node?.code,
          amount: net.toFixed(2),
        }
      })
    }

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
  const revenueComp = computeLine('Revenue', 'CREDIT_MINUS_DEBET')
  const cogsComp = computeLine('Cost Of Sales', 'DEBET_MINUS_CREDIT')

  // Gross profit = Revenue - COGS
  const grossProfitTotal = revenueComp.total.minus(cogsComp.total)
  const grossProfitByPeriod: Record<Id, Money> = {}
  for (const pId of allPeriodIds) {
    const revP = D(revenueComp.byPeriod[pId] ?? '0.00')
    const cogsP = D(cogsComp.byPeriod[pId] ?? '0.00')
    grossProfitByPeriod[pId] = revP.minus(cogsP).toFixed(2)
  }

  const opexComp = computeLine('Expense', 'DEBET_MINUS_CREDIT')

  // Operating profit = Gross profit - OPEX
  const opProfitTotal = grossProfitTotal.minus(opexComp.total)
  const opProfitByPeriod: Record<Id, Money> = {}
  for (const pId of allPeriodIds) {
    const gpP = D(grossProfitByPeriod[pId] ?? '0.00')
    const opexP = D(opexComp.byPeriod[pId] ?? '0.00')
    opProfitByPeriod[pId] = gpP.minus(opexP).toFixed(2)
  }

  const otherRevComp = computeLine('Other Revenue', 'CREDIT_MINUS_DEBET')
  const otherExpComp = computeLine('Other Expense', 'DEBET_MINUS_CREDIT')

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

  const ociComp = computeLine('OCI', 'CREDIT_MINUS_DEBET')

  // Comprehensive income = Net profit + OCI
  const compIncomeTotal = netProfitTotal.plus(ociComp.total)
  const compIncomeByPeriod: Record<Id, Money> = {}
  for (const pId of allPeriodIds) {
    const npP = D(netProfitByPeriod[pId] ?? '0.00')
    const ociP = D(ociComp.byPeriod[pId] ?? '0.00')
    compIncomeByPeriod[pId] = npP.plus(ociP).toFixed(2)
  }

  // Margin helper
  function calcMargin(amt: Decimal): string | null {
    if (revenueComp.total.isZero()) return null
    const ratio = safeDiv(amt.toFixed(2), revenueComp.total.toFixed(2))
    if (!ratio) return null
    return formatPercent(ratio, 'en', 1)
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
    {
      key: 'oci',
      amount: ociComp.total.toFixed(2),
      margin: null,
      byPeriod: ociComp.byPeriod,
      folders: ociComp.folders,
    },
    {
      key: 'comprehensiveIncome',
      amount: compIncomeTotal.toFixed(2),
      margin: null,
      byPeriod: compIncomeByPeriod,
      folders: [],
    },
  ]

  return { lines }
}
