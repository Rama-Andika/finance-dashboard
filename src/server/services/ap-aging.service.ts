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
import { apOpenInvoices, apUnallocatedPayments } from '~/server/repo/aging.repo'
import { listVendors } from '~/server/repo/party.repo'
import { agingCompareIsAvailable, controlAccountsGlTotal, distinctIds } from '~/server/services/shared/aging.helper'
import { reconcileAging, type AgingReconciliation } from '~/lib/finance/ap-ar/aging-reconciliation'
import {
  computeApAging as calculateApAging,
  type VendorAgingSummary,
} from '~/lib/finance/ap-ar/apar'
import type { AgingBucket } from '~/lib/finance/ap-ar/aging'
import type { CoaTree } from '~/lib/finance/coa/coa-tree'

export type ApAgingResult = {
  meta: MetricMeta
  total: Money
  unpaidBills: Money
  vendorCredits: Money
  unallocatedPayments: Money
  compareTotal: Money | null
  buckets: Record<AgingBucket, Money>
  overdueSubtotal: Money
  /** Past-due bills only (positive items): no vendor credits, no unallocated payments. */
  overdueBills: Money
  byVendor: VendorAgingSummary[]
  controlAccounts: Array<{ coaId: Id; code: string; name: string }>
  reconciliation: AgingReconciliation
}

export function computeApAging(filter: AppContextFilter): Promise<ApAgingResult> {
  return memoMetric('apAging', filter, () => computeApAgingUncached(filter))
}

async function compareAgingTotal(
  filter: AppContextFilter,
  vendorMap: Map<Id, { code: string; name: string }>,
  tree: CoaTree,
): Promise<Money | null> {
  if (!filter.compare || !filter.compare.asOf) return null
  if (!(await agingCompareIsAvailable(filter.compare.asOf))) return null
  const cmpAsOfPlusOne = addDays(filter.compare.asOf, 1)
  const [cmpA, cmpB] = await Promise.all([
    apOpenInvoices(cmpAsOfPlusOne, filter.locationIds),
    apUnallocatedPayments(cmpAsOfPlusOne, filter.locationIds),
  ])
  return calculateApAging({
    partA: cmpA,
    partB: cmpB,
    asOf: filter.compare.asOf,
    vendors: vendorMap,
    tree,
  }).total
}

/**
 * The heavy, snapshot-derived part (all open items of the selected entities, party names, aging buckets).
 * Cached for as long as the snapshot it was built from; it needs no GL read, so the party table can use it alone.
 */
async function apAgingCore(filter: AppContextFilter) {
  return memoBySnapshot('apAgingCore', { loc: filter.locationIds, asOf: filter.asOf }, async () => {
    const tree = await getCachedCoaTree()
    const asOfPlusOne = addDays(filter.asOf, 1)

    const [partA, partB] = await Promise.all([
      apOpenInvoices(asOfPlusOne, filter.locationIds),
      apUnallocatedPayments(asOfPlusOne, filter.locationIds),
    ])

    const vendorIds = distinctIds(partA.map((a) => a.vendorId), partB.map((b) => b.vendorId))
    const vendors = await listVendors(vendorIds)
    const vendorMap = new Map(vendors.map((v) => [v.vendorId, { code: v.code, name: v.name }]))

    const computed = calculateApAging({
      partA,
      partB,
      asOf: filter.asOf,
      vendors: vendorMap,
      tree,
    })
    return { computed, vendorMap, tree }
  })
}

/** The rows of the vendor / customer table (no GL read, no reconciliation). */
export async function computeApAgingParties(filter: AppContextFilter) {
  return (await apAgingCore(filter)).computed.byVendor
}

async function computeApAgingUncached(filter: AppContextFilter): Promise<ApAgingResult> {
  const meta = buildMetricMeta(filter)
  const { computed, vendorMap, tree } = await apAgingCore(filter)

  // The comparison total and the GL reconciliation do not depend on each other
  const controlCoaIds = computed.controlAccounts.map((a) => a.coaId)
  const [compareTotal, glTotal] = await Promise.all([
    compareAgingTotal(filter, vendorMap, tree),
    controlAccountsGlTotal(filter, controlCoaIds),
  ])

  return {
    meta,
    total: computed.total,
    unpaidBills: computed.unpaidBills,
    vendorCredits: computed.vendorCredits,
    unallocatedPayments: computed.unallocatedPayments,
    compareTotal,
    buckets: computed.buckets,
    overdueSubtotal: computed.overdueSubtotal,
    overdueBills: computed.overdueBills,
    byVendor: computed.byVendor,
    controlAccounts: computed.controlAccounts,
    reconciliation: reconcileAging(glTotal, computed.total),
  }
}
