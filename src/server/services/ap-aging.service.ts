import '@tanstack/react-start/server-only'
import { D, sum } from '~/lib/finance/money'
import { addDays } from '~/lib/format/date'
import { memoMetric } from '~/server/cache'
import { apArSnapshotCovers, apArSnapshotInfo, memoBySnapshot } from '~/server/dash/snapshot'
import type { Id, MetricMeta, Money } from '~/lib/finance/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
} from '~/server/context'
import {
  apOpenInvoices,
  apUnallocatedPayments,
  listVendors,
} from '~/server/repo/apar.repo'
import { balancesAt } from '~/server/services/balance.service'
import {
  computeApAging as calculateApAging,
  type VendorAgingSummary,
} from '~/lib/finance/apar'
import type { AgingBucket } from '~/lib/finance/aging'
import type { CoaTree } from '~/lib/finance/coa-tree'

export type ApAgingResult = {
  meta: MetricMeta
  total: Money
  unpaidBills: Money
  vendorCredits: Money
  unallocatedPayments: Money
  compareTotal: Money | null
  buckets: Record<AgingBucket, Money>
  overdueSubtotal: Money
  byVendor: VendorAgingSummary[]
  controlAccounts: Array<{ coaId: Id; code: string; name: string }>
  reconciliation: { gl: Money; subledger: Money; diff: Money; inSync: boolean }
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
  // Past dates are not in the snapshot (until month-end snapshots exist); computing them from the ERP tables
  // takes minutes, so the comparison is left out instead of blocking the page.
  if ((await apArSnapshotInfo()) && !(await apArSnapshotCovers(filter.compare.asOf))) return null
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

    const vendorIds = Array.from(
      new Set([...partA.map((a) => a.vendorId), ...partB.map((b) => b.vendorId)].filter(Boolean)),
    )
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

  // 4. Compare total and 5. GL reconciliation do not depend on each other
  const controlCoaIds = computed.controlAccounts.map((a) => a.coaId)
  const [compareTotal, glTotal] = await Promise.all([
    compareAgingTotal(filter, vendorMap, tree),
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
    unpaidBills: computed.unpaidBills,
    vendorCredits: computed.vendorCredits,
    unallocatedPayments: computed.unallocatedPayments,
    compareTotal,
    buckets: computed.buckets,
    overdueSubtotal: computed.overdueSubtotal,
    byVendor: computed.byVendor,
    controlAccounts: computed.controlAccounts,
    reconciliation: {
      gl: glTotal,
      subledger: computed.total,
      diff,
      inSync,
    },
  }
}
