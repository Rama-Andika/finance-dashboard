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
import { memoMetric } from '~/server/cache'
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
export type ClassifiedPortions = {
  lines: CfLine[]
  portions: ClassifiedCashPortion[]
  setupValid: boolean
  setup: CfSetupRow[]
  cashEquivIds: Id[]
  isOurCash: (l: CfLine) => boolean
}

/** Memoized: the drill-down asks for the same portions on every click and every page. */
export function loadClassifiedPortions(
  filter: AppContextFilter,
  ctx?: { tree?: CoaTree; periods?: Period[]; cashEquivIds?: Id[] },
): Promise<ClassifiedPortions> {
  return memoMetric('cashPortions', { filter, cashEquivIds: ctx?.cashEquivIds ?? null }, () =>
    loadClassifiedPortionsUncached(filter, ctx),
  )
}

async function loadClassifiedPortionsUncached(
  filter: AppContextFilter,
  ctx?: { tree?: CoaTree; periods?: Period[]; cashEquivIds?: Id[] },
): Promise<ClassifiedPortions> {
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

const DRAWERS = ['OPERATING', 'INVESTING', 'FUNDING'] as const

function emptyCashFlow(meta: MetricMeta, months: string[]): CashFlowResult {
  return {
    meta,
    source: 'fallback',
    openingCash: '0.00',
    drawers: DRAWERS.map((drawer) => ({ drawer, total: '0.00', rows: [] })),
    netCashFlow: '0.00',
    closingCash: '0.00',
    closingCashByBalance: '0.00',
    identityOk: true,
    monthly: months.map((month) => ({ month, cashIn: '0.00', cashOut: '0.00', net: '0.00' })),
    erpComparison: DRAWERS.map((drawer) => ({ drawer, dashboard: '0.00', erpMethod: '0.00', diff: '0.00' })),
  }
}

type SettledJournal = {
  /** Journal lines on our cash accounts */
  ourCash: CfLine[]
  /** Every other line (the counter side) */
  counterLines: CfLine[]
  /** Net movement on our cash accounts: debet − credit */
  netKas: Decimal
}

/**
 * Journals that really move our cash: they touch our cash, the net is not zero, and they have a
 * counter side (a journal with only our own cash lines is an internal transfer).
 */
function settledJournals(lines: CfLine[], isOurCash: (l: CfLine) => boolean): SettledJournal[] {
  const byJournal = new Map<string, CfLine[]>()
  for (const l of lines) {
    const list = byJournal.get(l.glId) ?? []
    list.push(l)
    byJournal.set(l.glId, list)
  }

  const result: SettledJournal[] = []
  for (const jLines of byJournal.values()) {
    const ourCash = jLines.filter(isOurCash)
    if (ourCash.length === 0) continue

    const netKas = ourCash.reduce((acc, c) => acc.plus(D(c.debet).minus(D(c.credit))), D(0))
    if (netKas.isZero()) continue

    const counterLines = jLines.filter((l) => !isOurCash(l))
    if (counterLines.length === 0) continue

    result.push({ ourCash, counterLines, netKas })
  }
  return result
}

function summarizeDrawers(portions: ClassifiedCashPortion[]): {
  drawers: CashFlowResult['drawers']
  netCashFlow: Decimal
} {
  type RowItem = { subGroup: string; amount: Decimal; unclassified?: boolean }
  const rowsByDrawer: Record<DrawerKey, Map<string, RowItem>> = {
    OPERATING: new Map(),
    INVESTING: new Map(),
    FUNDING: new Map(),
  }

  let netCashFlow = D(0)
  for (const p of portions) {
    const pDec = D(p.portion)
    netCashFlow = netCashFlow.plus(pDec)

    const drawerMap = rowsByDrawer[p.drawer]
    const existing = drawerMap.get(p.subGroup) ?? {
      subGroup: p.subGroup,
      amount: D(0),
      unclassified: p.unclassified,
    }
    existing.amount = existing.amount.plus(pDec)
    drawerMap.set(p.subGroup, existing)
  }

  const drawers = DRAWERS.map((drawer) => {
    let total = D(0)
    const rows = Array.from(rowsByDrawer[drawer].values()).map((r) => {
      total = total.plus(r.amount)
      return { subGroup: r.subGroup, amount: r.amount.toFixed(2), unclassified: r.unclassified }
    })
    return { drawer, total: total.toFixed(2), rows }
  })

  return { drawers, netCashFlow }
}

/** Cash in / out per month, one entry per journal that moves our cash. */
function monthlyTrend(
  journals: SettledJournal[],
  periods: Period[],
  months: string[],
): CashFlowResult['monthly'] {
  const periodById = new Map(periods.map((p) => [p.periodeId, p]))
  const totals = new Map<string, { cashIn: Decimal; cashOut: Decimal }>(
    months.map((m) => [m, { cashIn: D(0), cashOut: D(0) }]),
  )

  for (const j of journals) {
    const period = periodById.get(j.ourCash[0]!.periodId)
    const total = totals.get(period ? period.startDate.slice(0, 7) : '')
    if (!total) continue
    if (j.netKas.gt(0)) total.cashIn = total.cashIn.plus(j.netKas)
    else total.cashOut = total.cashOut.plus(j.netKas.abs())
  }

  return months.map((month) => {
    const m = totals.get(month) ?? { cashIn: D(0), cashOut: D(0) }
    return {
      month,
      cashIn: m.cashIn.toFixed(2),
      cashOut: m.cashOut.toFixed(2),
      net: m.cashIn.minus(m.cashOut).toFixed(2),
    }
  })
}

/** ERP method: sums the full counter lines without proportional allocation. */
function erpMethodTotals(
  journals: SettledJournal[],
  tree: CoaTree,
  setupValid: boolean,
  setup: CfSetupRow[],
): Record<DrawerKey, Decimal> {
  const totals: Record<DrawerKey, Decimal> = { OPERATING: D(0), INVESTING: D(0), FUNDING: D(0) }

  for (const j of journals) {
    for (const cl of j.counterLines) {
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

      if (drawer) totals[drawer] = totals[drawer].plus(clNet)
    }
  }
  return totals
}

export function computeCashFlow(filter: AppContextFilter): Promise<CashFlowResult> {
  return memoMetric('cashFlow', filter, () => computeCashFlowUncached(filter))
}

async function computeCashFlowUncached(filter: AppContextFilter): Promise<CashFlowResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()
  const resolved = resolveBaskets(await loadAccountMapping(tree), tree)

  // Kas & setara kas = cash ∪ bank ∪ deposit (D27)
  const cashEquivIds = Array.from(new Set([...resolved.cash, ...resolved.bank, ...resolved.deposit]))

  if (cashEquivIds.length === 0 || filter.periodIds.length === 0) {
    return emptyCashFlow(meta, filter.months)
  }

  // Opening cash = balance the day before d1; closing = balance at asOf; plus the cash journal lines.
  const [opRes, clRes, classified] = await Promise.all([
    balancesAt({ asOf: addDays(filter.d1, -1), coaIds: cashEquivIds, filter }),
    balancesAt({ asOf: filter.asOf, coaIds: cashEquivIds, filter }),
    loadClassifiedPortions(filter, { tree, periods, cashEquivIds }),
  ])
  const { lines, portions, setupValid, setup, isOurCash } = classified

  const openingCash = sum(cashEquivIds.map((id) => opRes.byCoa.get(id) ?? '0.00'))
  const closingCashByBalance = sum(cashEquivIds.map((id) => clRes.byCoa.get(id) ?? '0.00'))

  const { drawers, netCashFlow: netCashFlowDec } = summarizeDrawers(portions)
  const closingCash = D(openingCash).plus(netCashFlowDec).toFixed(2)

  const journals = settledJournals(lines, isOurCash)
  const erpTotals = erpMethodTotals(journals, tree, setupValid, setup)

  const erpComparison = DRAWERS.map((drawer) => {
    const dashboard = drawers.find((d) => d.drawer === drawer)?.total ?? '0.00'
    const erpMethod = erpTotals[drawer].toFixed(2)
    return { drawer, dashboard, erpMethod, diff: D(dashboard).minus(D(erpMethod)).toFixed(2) }
  })

  return {
    meta,
    source: setupValid ? 'setup' : 'fallback',
    openingCash,
    drawers,
    netCashFlow: netCashFlowDec.toFixed(2),
    closingCash,
    closingCashByBalance,
    identityOk: closingCash === closingCashByBalance,
    monthly: monthlyTrend(journals, periods, filter.months),
    erpComparison,
  }
}
