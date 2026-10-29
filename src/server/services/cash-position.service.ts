import '@tanstack/react-start/server-only'
import { D, sum } from '~/lib/finance/money'
import type { Money, Id, MetricMeta, Breakdown } from '~/lib/finance/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedEntities,
} from '~/server/context'
import { loadAccountMapping } from '~/server/services/mapping.helper'
import { resolveBaskets } from '~/lib/finance/basket-resolver'
import { balancesAt } from '~/server/services/balance.service'
import { unsettledByChannel } from '~/server/repo/bank-payment.repo'
import {
  buildCashPositionBreakdown,
  computeCashTotals,
  computeInTransitDetail,
  reconcileInTransit,
  type InTransitDetailItem,
  type CashPositionReconciliation,
} from '~/lib/finance/cash-position'

export type CashPositionResult = {
  meta: MetricMeta
  cash: Money
  bank: Money
  cashPosition: Money
  deposit: Money
  inTransit: Money
  compare: { cashPosition: Money | null }
  byFolder: Breakdown[]
  byEntity: Array<{ code: string; name: string; amount: Money; isNegative: boolean }>
  inTransitDetail: InTransitDetailItem[]
  reconciliation: CashPositionReconciliation
}

export async function computeCashPosition(
  filter: AppContextFilter,
): Promise<CashPositionResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const mapping = await loadAccountMapping(tree)
  const resolved = resolveBaskets(mapping, tree)

  const cashIds = resolved.cash
  const bankIds = resolved.bank
  const depositIds = resolved.deposit
  const inTransitIds = resolved.inTransit

  // If both cash and bank are empty, return zeroes
  if (cashIds.length === 0 && bankIds.length === 0) {
    return {
      meta,
      cash: '0.00',
      bank: '0.00',
      cashPosition: '0.00',
      deposit: '0.00',
      inTransit: '0.00',
      compare: { cashPosition: null },
      byFolder: [],
      byEntity: [],
      inTransitDetail: [],
      reconciliation: {
        glInTransit: '0.00',
        registerUnsettled: '0.00',
        diff: '0.00',
        inSync: true,
      },
    }
  }

  const allCoaIds = Array.from(
    new Set([...cashIds, ...bankIds, ...depositIds, ...inTransitIds]),
  )

  // 1. Balances at asOf
  const asOfBalances = await balancesAt({
    asOf: filter.asOf,
    coaIds: allCoaIds,
    filter,
  })

  // 2. Compare cash position at compare.asOf
  let compareCashPosition: Money | null = null
  if (filter.compare && filter.compare.asOf) {
    const compareRes = await balancesAt({
      asOf: filter.compare.asOf,
      coaIds: Array.from(new Set([...cashIds, ...bankIds])),
      filter: {
        ...filter,
        d1: filter.compare.d1,
        asOf: filter.compare.asOf,
        periodIds: filter.compare.periodIds,
      },
    })
    const cmpCashSum = sum(cashIds.map((id) => compareRes.byCoa.get(id) ?? '0.00'))
    const cmpBankSum = sum(bankIds.map((id) => compareRes.byCoa.get(id) ?? '0.00'))
    compareCashPosition = D(cmpCashSum).plus(D(cmpBankSum)).toFixed(2)
  }

  // 3. Totals
  const cashBalances = cashIds.map((id) => asOfBalances.byCoa.get(id) ?? '0.00')
  const bankBalances = bankIds.map((id) => asOfBalances.byCoa.get(id) ?? '0.00')
  const depositBalances = depositIds.map((id) => asOfBalances.byCoa.get(id) ?? '0.00')
  const inTransitBalances = inTransitIds.map((id) => asOfBalances.byCoa.get(id) ?? '0.00')

  const totals = computeCashTotals(
    cashBalances,
    bankBalances,
    depositBalances,
    inTransitBalances,
  )

  // 4. Breakdown byFolder
  const byFolder = buildCashPositionBreakdown(
    tree,
    cashIds,
    bankIds,
    asOfBalances.byCoa,
  )

  // 5. In transit details and reconciliation
  const unsettled = await unsettledByChannel(
    filter.asOf,
    inTransitIds,
    filter.segmentDetailIds,
    filter.entitySegmentColumn,
  )

  const inTransitDetail = computeInTransitDetail({
    inTransitCoaIds: inTransitIds,
    tree,
    unsettled,
    today: filter.today,
  })

  const registerUnsettledTotal = sum(unsettled.map((u) => u.amount))
  const reconciliation = reconcileInTransit(totals.inTransit, registerUnsettledTotal)

  // 6. By Entity
  const { entities } = await getCachedEntities()
  const targetEntities =
    filter.locationIds === 'all'
      ? entities
      : entities.filter((e) => filter.locationIds.includes(e.locationId))

  const cashAndBankIds = Array.from(new Set([...cashIds, ...bankIds]))

  const byEntityList = await Promise.all(
    targetEntities.map(async (e) => {
      const entRes = await balancesAt({
        asOf: filter.asOf,
        coaIds: cashAndBankIds,
        filter: {
          ...filter,
          locationIds: [e.locationId],
          segmentDetailIds: e.segmentDetailIds,
        },
      })

      const entSum = sum(cashAndBankIds.map((id) => entRes.byCoa.get(id) ?? '0.00'))
      return {
        code: e.code,
        name: e.name,
        amount: entSum,
        isNegative: D(entSum).lt(0),
      }
    }),
  )

  return {
    meta,
    cash: totals.cash,
    bank: totals.bank,
    cashPosition: totals.cashPosition,
    deposit: totals.deposit,
    inTransit: totals.inTransit,
    compare: { cashPosition: compareCashPosition },
    byFolder,
    byEntity: byEntityList,
    inTransitDetail,
    reconciliation,
  }
}
