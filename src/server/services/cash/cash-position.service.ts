import '@tanstack/react-start/server-only'
import { entitiesOfFilter } from '~/lib/filters/filter-scope'
import { D, sum } from '~/lib/core/money'
import type { Money, Id, MetricMeta, Breakdown } from '~/lib/core/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedEntities,
} from '~/server/context'
import { memoMetric } from '~/server/cache'
import { env } from '~/server/env'
import { loadResolvedBaskets } from '~/server/services/shared/resolved-baskets'
import { balancesAt, balancesBySegmentAt } from '~/server/services/cash/balance.service'
import { outstandingGiro, unsettledByChannel } from '~/server/repo/cash/bank-payment.repo'
import {
  buildCashPositionBreakdown,
  computeCashTotals,
  computeInTransitDetail,
  reconcileInTransit,
  type InTransitDetailItem,
  type CashPositionReconciliation,
} from '~/lib/finance/cash/cash-position'

export type CashPositionResult = {
  meta: MetricMeta
  cash: Money
  bank: Money
  cashPosition: Money
  deposit: Money
  inTransit: Money
  /** Giro / cheque payments not cleared by the bank yet: information next to the cash position, not part of it. */
  giroOutstanding: Money
  compare: { cashPosition: Money | null }
  byFolder: Breakdown[]
  byEntity: Array<{ code: string; name: string; amount: Money; isNegative: boolean }>
  inTransitDetail: InTransitDetailItem[]
  reconciliation: CashPositionReconciliation
}

export type CashPositionOptions = {
  /** Per-entity breakdown (one grouped query). Callers that only need totals pass false. */
  includeByEntity?: boolean
  /** Balance at compare.asOf for the KPI comparison. */
  includeCompare?: boolean
}

export function computeCashPosition(
  filter: AppContextFilter,
  opts: CashPositionOptions = {},
): Promise<CashPositionResult> {
  return memoMetric('cashPosition', { filter, opts }, () => computeCashPositionUncached(filter, opts))
}

const ZERO: Money = '0.00'

/** Balance of each account in `ids` out of a balance map; an account without movement counts as zero. */
const balancesOf = (ids: Id[], byCoa: Map<Id, Money>): Money[] => ids.map((id) => byCoa.get(id) ?? ZERO)

function emptyCashPosition(meta: MetricMeta): CashPositionResult {
  return {
    meta,
    cash: ZERO,
    bank: ZERO,
    cashPosition: ZERO,
    deposit: ZERO,
    inTransit: ZERO,
    giroOutstanding: ZERO,
    compare: { cashPosition: null },
    byFolder: [],
    byEntity: [],
    inTransitDetail: [],
    reconciliation: { glInTransit: ZERO, registerUnsettled: ZERO, diff: ZERO, inSync: true },
  }
}

/** Cash + bank balance per entity out of one grouped query (not one balance run per entity). */
async function entityCashBalances(
  filter: AppContextFilter,
  cashAndBankIds: Id[],
  bySegment: Map<Id, Map<Id, Money>>,
): Promise<CashPositionResult['byEntity']> {
  const { entities } = await getCachedEntities()
  const targetEntities = entitiesOfFilter(entities, filter.locationIds)

  return targetEntities.map((e) => {
    const amounts = e.segmentDetailIds.flatMap((segId) => {
      const segBalances = bySegment.get(segId)
      return segBalances ? balancesOf(cashAndBankIds, segBalances) : []
    })
    const entSum = sum(amounts)
    return { code: e.code, name: e.name, amount: entSum, isNegative: D(entSum).lt(0) }
  })
}

type CashPositionReads = {
  asOfBalances: Awaited<ReturnType<typeof balancesAt>>
  compareRes: Awaited<ReturnType<typeof balancesAt>> | null
  unsettled: Awaited<ReturnType<typeof unsettledByChannel>>
  byEntityBalances: Awaited<ReturnType<typeof balancesBySegmentAt>> | null
  giroOutstanding: Awaited<ReturnType<typeof outstandingGiro>>
}

/** The reads Cash Position needs, started together: balances, compare balances, unsettled register, giro and per-entity balances. */
async function readCashPositionInputs(
  filter: AppContextFilter,
  ids: { allCoaIds: Id[]; cashAndBankIds: Id[]; inTransitIds: Id[] },
  opts: { includeByEntity: boolean; includeCompare: boolean },
): Promise<CashPositionReads> {
  const { allCoaIds, cashAndBankIds, inTransitIds } = ids
  const compare = opts.includeCompare && filter.compare && filter.compare.asOf ? filter.compare : null
  // Awaited together so a failure in one read never leaves another rejection unhandled.
  const [asOfBalances, compareRes, unsettled, byEntityBalances, giroOutstanding] = await Promise.all([
    balancesAt({ asOf: filter.asOf, coaIds: allCoaIds, filter }),
    compare
      ? balancesAt({
          asOf: compare.asOf,
          coaIds: cashAndBankIds,
          filter: { ...filter, d1: compare.d1, asOf: compare.asOf, periodIds: compare.periodIds },
        })
      : null,
    unsettledByChannel(filter.asOf, inTransitIds, filter.segmentDetailIds, filter.entitySegmentColumn),
    opts.includeByEntity ? balancesBySegmentAt({ asOf: filter.asOf, coaIds: cashAndBankIds, filter }) : null,
    outstandingGiro(filter.asOf, filter.segmentDetailIds, filter.entitySegmentColumn),
  ])
  return { asOfBalances, compareRes, unsettled, byEntityBalances, giroOutstanding }
}

async function computeCashPositionUncached(
  filter: AppContextFilter,
  opts: CashPositionOptions,
): Promise<CashPositionResult> {
  const includeByEntity = opts.includeByEntity ?? true
  const includeCompare = opts.includeCompare ?? true
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const resolved = await loadResolvedBaskets(tree)

  const cashIds = resolved.cash
  const bankIds = resolved.bank
  const depositIds = resolved.deposit
  const inTransitIds = resolved.inTransit

  // If both cash and bank are empty, return zeroes
  if (cashIds.length === 0 && bankIds.length === 0) return emptyCashPosition(meta)

  const allCoaIds = Array.from(
    new Set([...cashIds, ...bankIds, ...depositIds, ...inTransitIds]),
  )

  const cashAndBankIds = Array.from(new Set([...cashIds, ...bankIds]))
  const { asOfBalances, compareRes, unsettled, byEntityBalances, giroOutstanding } = await readCashPositionInputs(
    filter,
    { allCoaIds, cashAndBankIds, inTransitIds },
    { includeByEntity, includeCompare },
  )

  // Cash position at compare.asOf
  const compareCashPosition = compareRes
    ? D(sum(balancesOf(cashIds, compareRes.byCoa))).plus(D(sum(balancesOf(bankIds, compareRes.byCoa)))).toFixed(2)
    : null

  const totals = computeCashTotals(
    balancesOf(cashIds, asOfBalances.byCoa),
    balancesOf(bankIds, asOfBalances.byCoa),
    balancesOf(depositIds, asOfBalances.byCoa),
    balancesOf(inTransitIds, asOfBalances.byCoa),
  )

  // 4. Breakdown byFolder
  const byFolder = buildCashPositionBreakdown(
    tree,
    cashIds,
    bankIds,
    asOfBalances.byCoa,
  )

  // 5. In transit details and reconciliation

  const inTransitDetail = computeInTransitDetail({
    inTransitCoaIds: inTransitIds,
    tree,
    unsettled,
    today: filter.today,
    alertDays: env.IN_TRANSIT_ALERT_DAYS,
  })

  const registerUnsettledTotal = sum(unsettled.map((u) => u.amount))
  const reconciliation = reconcileInTransit(totals.inTransit, registerUnsettledTotal)

  const byEntityList = byEntityBalances ? await entityCashBalances(filter, cashAndBankIds, byEntityBalances.bySegment) : []

  return {
    meta,
    cash: totals.cash,
    bank: totals.bank,
    cashPosition: totals.cashPosition,
    deposit: totals.deposit,
    inTransit: totals.inTransit,
    giroOutstanding,
    compare: { cashPosition: compareCashPosition },
    byFolder,
    byEntity: byEntityList,
    inTransitDetail,
    reconciliation,
  }
}
