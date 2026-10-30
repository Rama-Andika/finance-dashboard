import '@tanstack/react-start/server-only'
import { addDays } from '~/lib/format/date'
import { memoMetric } from '~/server/cache'
import { memoBySnapshot } from '~/server/dash/snapshot'
import type { Id, MetricMeta, Money } from '~/lib/core/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
} from '~/server/context'
import { arOpenInvoices, arUnallocatedReceipts } from '~/server/repo/aging.repo'
import { listCustomers } from '~/server/repo/party.repo'
import { agingCompareIsAvailable, controlAccountsGlTotal, distinctIds } from '~/server/services/shared/aging.helper'
import { reconcileAging, type AgingReconciliation } from '~/lib/finance/ap-ar/aging-reconciliation'
import {
  computeArAging as calculateArAging,
  type CustomerAgingSummary,
} from '~/lib/finance/ap-ar/apar'
import type { AgingBucket } from '~/lib/finance/ap-ar/aging'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'

export type ArAgingResult = {
  meta: MetricMeta
  total: Money
  unpaidInvoices: Money
  customerCredits: Money
  unallocatedReturns: Money
  nonTrade: Money
  compareTotal: Money | null
  buckets: Record<AgingBucket, Money>
  overdueSubtotal: Money
  byCustomer: CustomerAgingSummary[]
  controlAccounts: Array<{ coaId: Id; code: string; name: string }>
  reconciliation: AgingReconciliation
}

export function computeArAging(filter: AppContextFilter): Promise<ArAgingResult> {
  return memoMetric('arAging', filter, () => computeArAgingUncached(filter))
}

async function compareAgingTotal(
  filter: AppContextFilter,
  customerMap: Map<Id, { code: string; name: string }>,
  tree: CoaTree,
): Promise<Money | null> {
  if (!filter.compare || !filter.compare.asOf) return null
  if (!(await agingCompareIsAvailable(filter.compare.asOf))) return null
  const cmpAsOfPlusOne = addDays(filter.compare.asOf, 1)
  const [cmpA, cmpB] = await Promise.all([
    arOpenInvoices(cmpAsOfPlusOne, filter.locationIds),
    arUnallocatedReceipts(cmpAsOfPlusOne, filter.locationIds),
  ])
  return calculateArAging({
    partA: cmpA,
    partB: cmpB,
    asOf: filter.compare.asOf,
    customers: customerMap,
    tree,
  }).total
}

/**
 * The heavy, snapshot-derived part (all open items of the selected entities, party names, aging buckets).
 * Cached for as long as the snapshot it was built from; it needs no GL read, so the party table can use it alone.
 */
async function arAgingCore(filter: AppContextFilter) {
  return memoBySnapshot('arAgingCore', { loc: filter.locationIds, asOf: filter.asOf }, async () => {
    const tree = await getCachedCoaTree()
    const asOfPlusOne = addDays(filter.asOf, 1)

    const [partA, partB] = await Promise.all([
      arOpenInvoices(asOfPlusOne, filter.locationIds),
      arUnallocatedReceipts(asOfPlusOne, filter.locationIds),
    ])

    const customerIds = distinctIds(partA.map((a) => a.customerId), partB.map((b) => b.customerId))
    const customers = await listCustomers(customerIds)
    const customerMap = new Map(customers.map((v) => [v.customerId, { code: v.code, name: v.name }]))

    const computed = calculateArAging({
      partA,
      partB,
      asOf: filter.asOf,
      customers: customerMap,
      tree,
    })
    return { computed, customerMap, tree }
  })
}

/** The rows of the vendor / customer table (no GL read, no reconciliation). */
export async function computeArAgingParties(filter: AppContextFilter) {
  return (await arAgingCore(filter)).computed.byCustomer
}

async function computeArAgingUncached(filter: AppContextFilter): Promise<ArAgingResult> {
  const meta = buildMetricMeta(filter)
  const { computed, customerMap, tree } = await arAgingCore(filter)

  // The comparison total and the GL reconciliation do not depend on each other
  const controlCoaIds = computed.controlAccounts.map((a) => a.coaId)
  const [compareTotal, glTotal] = await Promise.all([
    compareAgingTotal(filter, customerMap, tree),
    controlAccountsGlTotal(filter, controlCoaIds),
  ])

  return {
    meta,
    total: computed.total,
    unpaidInvoices: computed.unpaidInvoices,
    customerCredits: computed.customerCredits,
    unallocatedReturns: computed.unallocatedReturns,
    nonTrade: computed.nonTrade,
    compareTotal,
    buckets: computed.buckets,
    overdueSubtotal: computed.overdueSubtotal,
    byCustomer: computed.byCustomer,
    controlAccounts: computed.controlAccounts,
    reconciliation: reconcileAging(glTotal, computed.total),
  }
}
