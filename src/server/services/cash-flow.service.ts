import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D, sum } from '~/lib/finance/money'
import { addDays } from '~/lib/format/date'
import type { Id, MetricMeta, Money, Period } from '~/lib/finance/types'
import type { CoaTree } from '~/lib/finance/coa-tree'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedPeriods,
} from '~/server/context'
import { loadAccountMapping } from '~/server/services/mapping.helper'
import { resolveBaskets } from '~/lib/finance/basket-resolver'
import { balancesAt } from '~/server/services/balance.service'
import {
  linesOfCashJournals,
  getCashFlowSetup,
  type CashJournalLineRow,
} from '~/server/repo/cashflow.repo'
import {
  allocateCash,
  classifyBySetup,
  classifyByFallback,
  isSetupValid,
  type DrawerKey,
  type CfLine,
  type CfSetupRow,
  type ClassifiedPortion,
} from '~/lib/finance/cashflow'

export type CashFlowResult = {
  meta: MetricMeta
  source: 'setup' | 'fallback'
  openingCash: Money
  drawers: Array<{
    drawer: DrawerKey
    total: Money
    rows: Array<{ subGroup: string; amount: Money; unclassified?: boolean }>
  }>
  netCashFlow: Money
  closingCash: Money
  closingCashByBalance: Money
  identityOk: boolean
  monthly: Array<{ month: string; cashIn: Money; cashOut: Money; net: Money }>
  erpComparison: Array<{
    drawer: string
    dashboard: Money
    erpMethod: Money
    diff: Money
  }>
}

export type ClassifiedCashPortion = {
  glId: Id
  journalType: number
  periodId: Id
  counterCoaId: Id
  portion: Money
  drawer: DrawerKey
  subGroup: string
  unclassified?: boolean
}

/** Sub-row label for portions that no cash_flow_setup row accepts (D27). */
export const UNCLASSIFIED_SUBGROUP = 'Unclassified'

/**
 * Loads the cash journals of the selected periods, allocates cash proportionally to the
 * counter lines and classifies every portion (data-model §6.3). Shared by the Cash Flow
 * metric and its drill-down so both always show the same numbers.
 */
export async function loadClassifiedPortions(
  filter: AppContextFilter,
  ctx?: { tree?: CoaTree; periods?: Period[]; cashEquivIds?: Id[] },
): Promise<{
  lines: CfLine[]
  portions: ClassifiedCashPortion[]
  setupValid: boolean
  setup: CfSetupRow[]
  cashEquivIds: Id[]
  isOurCash: (l: CfLine) => boolean
}> {
  const tree = ctx?.tree ?? (await getCachedCoaTree())
  const periods = ctx?.periods ?? (await getCachedPeriods())
  let cashEquivIds = ctx?.cashEquivIds
  if (!cashEquivIds) {
    const resolved = resolveBaskets(await loadAccountMapping(tree), tree)
    cashEquivIds = Array.from(new Set([...resolved.cash, ...resolved.bank, ...resolved.deposit]))
  }

  const cashSet = new Set(cashEquivIds)
  const segIdSet = filter.segmentDetailIds === 'all' ? null : new Set(filter.segmentDetailIds)
  const isOurCash = (l: CfLine) => {
    if (!cashSet.has(l.coaId)) return false
    if (!segIdSet) return true
    return l.segmentDetailId ? segIdSet.has(l.segmentDetailId) : false
  }

  const setup = await getCashFlowSetup()
  const setupValid = isSetupValid(setup)

  const activePeriods = periods.filter((p) => filter.periodIds.includes(p.periodeId))
  if (cashEquivIds.length === 0 || activePeriods.length === 0) {
    return { lines: [], portions: [], setupValid, setup, cashEquivIds, isOurCash }
  }

  const lines: CfLine[] = await linesOfCashJournals({
    periods: activePeriods,
    segCol: filter.entitySegmentColumn,
    segIds: filter.segmentDetailIds,
    cashCoaIds: cashEquivIds,
  })

  const portions: ClassifiedCashPortion[] = allocateCash(lines, isOurCash).map((p) => {
    const counterNode = tree.byId.get(p.counterCoaId)
    const counter = {
      accountGroup: counterNode?.accountGroup ?? '',
      subAccountGroup: counterNode?.subAccountGroup ?? '',
    }
    let classified: ClassifiedPortion
    if (setupValid) {
      const res = classifyBySetup(p.portion, counter, setup)
      classified =
        res === 'UNCLASSIFIED'
          ? { drawer: 'OPERATING', subGroup: UNCLASSIFIED_SUBGROUP, unclassified: true }
          : res
    } else {
      classified = classifyByFallback(p.portion, counter, p.journalType)
    }
    return { ...p, ...classified }
  })

  return { lines, portions, setupValid, setup, cashEquivIds, isOurCash }
}

export async function computeCashFlow(
  filter: AppContextFilter,
): Promise<CashFlowResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()
  const mapping = await loadAccountMapping(tree)
  const resolved = resolveBaskets(mapping, tree)

  // Kas & setara kas = cash ∪ bank ∪ deposit (D27)
  const cashEquivIds = Array.from(
    new Set([...resolved.cash, ...resolved.bank, ...resolved.deposit]),
  )

  if (cashEquivIds.length === 0 || filter.periodIds.length === 0) {
    return {
      meta,
      source: 'fallback',
      openingCash: '0.00',
      drawers: [
        { drawer: 'OPERATING', total: '0.00', rows: [] },
        { drawer: 'INVESTING', total: '0.00', rows: [] },
        { drawer: 'FUNDING', total: '0.00', rows: [] },
      ],
      netCashFlow: '0.00',
      closingCash: '0.00',
      closingCashByBalance: '0.00',
      identityOk: true,
      monthly: filter.months.map((m) => ({
        month: m,
        cashIn: '0.00',
        cashOut: '0.00',
        net: '0.00',
      })),
      erpComparison: [
        { drawer: 'OPERATING', dashboard: '0.00', erpMethod: '0.00', diff: '0.00' },
        { drawer: 'INVESTING', dashboard: '0.00', erpMethod: '0.00', diff: '0.00' },
        { drawer: 'FUNDING', dashboard: '0.00', erpMethod: '0.00', diff: '0.00' },
      ],
    }
  }

  // 1. Opening Cash = Balance on the day before d1
  const dayBeforeD1 = addDays(filter.d1, -1)
  const opRes = await balancesAt({
    asOf: dayBeforeD1,
    coaIds: cashEquivIds,
    filter,
  })
  const openingCash = sum(cashEquivIds.map((id) => opRes.byCoa.get(id) ?? '0.00'))

  // 2. Closing Cash by Balance Engine = Balance at asOf
  const clRes = await balancesAt({
    asOf: filter.asOf,
    coaIds: cashEquivIds,
    filter,
  })
  const closingCashByBalance = sum(
    cashEquivIds.map((id) => clRes.byCoa.get(id) ?? '0.00'),
  )

  // 3–5. Cash journal lines, proportional allocation and classification
  const { lines, portions, setupValid, setup, isOurCash } = await loadClassifiedPortions(filter, {
    tree,
    periods,
    cashEquivIds,
  })
  const source: 'setup' | 'fallback' = setupValid ? 'setup' : 'fallback'

  type RowItem = { subGroup: string; amount: Decimal; unclassified?: boolean }
  const drawerRowsMap: Record<DrawerKey, Map<string, RowItem>> = {
    OPERATING: new Map(),
    INVESTING: new Map(),
    FUNDING: new Map(),
  }

  let netCashFlowDec = D(0)

  for (const p of portions) {
    const pDec = D(p.portion)
    netCashFlowDec = netCashFlowDec.plus(pDec)

    const drawerMap = drawerRowsMap[p.drawer]
    const existing = drawerMap.get(p.subGroup) ?? {
      subGroup: p.subGroup,
      amount: D(0),
      unclassified: p.unclassified,
    }
    existing.amount = existing.amount.plus(pDec)
    drawerMap.set(p.subGroup, existing)
  }

  const netCashFlow = netCashFlowDec.toFixed(2)
  const closingCash = D(openingCash).plus(netCashFlowDec).toFixed(2)
  const identityOk = closingCash === closingCashByBalance

  const drawers: Array<{
    drawer: DrawerKey
    total: Money
    rows: Array<{ subGroup: string; amount: Money; unclassified?: boolean }>
  }> = (['OPERATING', 'INVESTING', 'FUNDING'] as const).map((drawerKey) => {
    const dMap = drawerRowsMap[drawerKey]
    let dTotal = D(0)
    const rows = Array.from(dMap.values()).map((r) => {
      dTotal = dTotal.plus(r.amount)
      return {
        subGroup: r.subGroup,
        amount: r.amount.toFixed(2),
        unclassified: r.unclassified,
      }
    })
    return {
      drawer: drawerKey,
      total: dTotal.toFixed(2),
      rows,
    }
  })

  // 6. Monthly trend (cashIn, cashOut, net)
  // Group journals by period to compute netKas per journal
  const periodById = new Map(periods.map((p) => [p.periodeId, p]))
  const journalGroups = new Map<string, CfLine[]>()
  for (const l of lines) {
    const list = journalGroups.get(l.glId) ?? []
    list.push(l)
    journalGroups.set(l.glId, list)
  }

  const monthlyTotals = new Map<string, { cashIn: Decimal; cashOut: Decimal }>()
  for (const m of filter.months) {
    monthlyTotals.set(m, { cashIn: D(0), cashOut: D(0) })
  }

  for (const jLines of journalGroups.values()) {
    const ourCash = jLines.filter(isOurCash)
    if (ourCash.length === 0) continue

    let netKas = D(0)
    for (const c of ourCash) {
      netKas = netKas.plus(D(c.debet).minus(D(c.credit)))
    }

    if (netKas.isZero()) continue
    const counterLines = jLines.filter((l) => !isOurCash(l))
    if (counterLines.length === 0) continue // internal transfer

    const pId = ourCash[0]!.periodId
    const period = periodById.get(pId)
    const month = period ? period.startDate.slice(0, 7) : ''

    const mTotal = monthlyTotals.get(month)
    if (mTotal) {
      if (netKas.gt(0)) {
        mTotal.cashIn = mTotal.cashIn.plus(netKas)
      } else {
        mTotal.cashOut = mTotal.cashOut.plus(netKas.abs())
      }
    }
  }

  const monthly = filter.months.map((month) => {
    const m = monthlyTotals.get(month) ?? { cashIn: D(0), cashOut: D(0) }
    return {
      month,
      cashIn: m.cashIn.toFixed(2),
      cashOut: m.cashOut.toFixed(2),
      net: m.cashIn.minus(m.cashOut).toFixed(2),
    }
  })

  // 7. ERP comparison
  // ERP sums full counter lines without proportions for mapped items
  const erpTotals: Record<DrawerKey, Decimal> = {
    OPERATING: D(0),
    INVESTING: D(0),
    FUNDING: D(0),
  }

  for (const jLines of journalGroups.values()) {
    const ourCash = jLines.filter(isOurCash)
    if (ourCash.length === 0) continue

    let netKas = D(0)
    for (const c of ourCash) {
      netKas = netKas.plus(D(c.debet).minus(D(c.credit)))
    }
    if (netKas.isZero()) continue

    const counterLines = jLines.filter((l) => !isOurCash(l))
    if (counterLines.length === 0) continue

    for (const cl of counterLines) {
      const counterNode = tree.byId.get(cl.coaId)
      const counter = {
        accountGroup: counterNode?.accountGroup ?? '',
        subAccountGroup: counterNode?.subAccountGroup ?? '',
      }
      // Counter line net movement
      const clNet = D(cl.credit).minus(D(cl.debet))

      let drawer: DrawerKey | null = null
      if (setupValid) {
        const res = classifyBySetup(clNet.toFixed(2), counter, setup)
        if (res !== 'UNCLASSIFIED') drawer = res.drawer
      } else {
        const res = classifyByFallback(clNet.toFixed(2), counter, cl.journalType)
        if (!res.unclassified) drawer = res.drawer
      }

      if (drawer) {
        erpTotals[drawer] = erpTotals[drawer].plus(clNet)
      }
    }
  }

  const erpComparison = (['OPERATING', 'INVESTING', 'FUNDING'] as const).map(
    (drawerKey) => {
      const dashTotal = drawers.find((d) => d.drawer === drawerKey)?.total ?? '0.00'
      const erpAmt = erpTotals[drawerKey].toFixed(2)
      const diff = D(dashTotal).minus(D(erpAmt)).toFixed(2)
      return {
        drawer: drawerKey,
        dashboard: dashTotal,
        erpMethod: erpAmt,
        diff,
      }
    },
  )

  return {
    meta,
    source,
    openingCash,
    drawers,
    netCashFlow,
    closingCash,
    closingCashByBalance,
    identityOk,
    monthly,
    erpComparison,
  }
}
