import '@tanstack/react-start/server-only'
import { D, sum } from '~/lib/core/money'
import { addDays } from '~/lib/format/date'
import { memoMetric } from '~/server/cache'
import { apArSnapshotCovers, apArSnapshotInfo, memoBySnapshot } from '~/server/dash/snapshot'
import { apArHistCovers } from '~/server/dash/snapshot-hist'
import type { Id, MetricMeta, Money } from '~/lib/core/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
} from '~/server/context'
import { arOpenInvoices, arUnallocatedReceipts } from '~/server/repo/aging.repo'
import { listCustomers } from '~/server/repo/party.repo'
import { balancesAt } from '~/server/services/balance.service'
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
  reconciliation: { gl: Money; subledger: Money; diff: Money; inSync: boolean }
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
  // A past date is answered from the month-end history when that month has been built; otherwise computing it from the ERP tables
  // takes minutes, so the comparison is left out instead of blocking the page.
  if ((await apArSnapshotInfo()) && !(await apArSnapshotCovers(filter.compare.asOf)) && !(await apArHistCovers(filter.compare.asOf))) return null
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

    const customerIds = Array.from(
      new Set([...partA.map((a) => a.customerId), ...partB.map((b) => b.customerId)].filter(Boolean)),
    )
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

  // 4. Compare total and 5. GL reconciliation do not depend on each other
  const controlCoaIds = computed.controlAccounts.map((a) => a.coaId)
  const [compareTotal, glTotal] = await Promise.all([
    compareAgingTotal(filter, customerMap, tree),
    controlCoaIds.length > 0
      ? balancesAt({ asOf: filter.asOf, coaIds: controlCoaIds, filter }).then((r) =>
          sum(controlCoaIds.map((id) => r.byCoa.get(id) ?? '0.00')),
        )
      : Promise.resolve('0.00'),
  ])

  const diff = D(glTotal).minus(D(computed.total)).toFixed(2)
  const inSync = D(diff).abs().lt(1)

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
    reconciliation: {
      gl: glTotal,
      subledger: computed.total,
      diff,
      inSync,
    },
  }
}
