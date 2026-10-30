import '@tanstack/react-start/server-only'
import { memoMetric } from '~/server/cache'
import type { Id, MetricMeta, Money } from '~/lib/core/types'
import { type AppContextFilter, buildMetricMeta } from '~/server/context'
import { apOpenInvoices, apUnallocatedPayments } from '~/server/repo/aging.repo'
import { listVendors } from '~/server/repo/party.repo'
import { controlAccountsGlTotal } from '~/server/services/shared/aging.helper'
import { createAgingReader } from '~/server/services/shared/aging-reader'
import { reconcileAging, type AgingReconciliation } from '~/lib/finance/ap-ar/aging-reconciliation'
import {
  computeApAging as calculateApAging,
  type VendorAgingSummary,
} from '~/lib/finance/ap-ar/apar'
import type { AgingBucket } from '~/lib/finance/ap-ar/aging'

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

const payables = createAgingReader({
  cacheName: 'apAgingCore',
  openItems: (asOfPlusOne, locationIds) => apOpenInvoices(asOfPlusOne, locationIds),
  unallocatedItems: (asOfPlusOne, locationIds) => apUnallocatedPayments(asOfPlusOne, locationIds),
  openPartyId: (item) => item.vendorId,
  unallocatedPartyId: (item) => item.vendorId,
  loadPartyNames: async (ids) =>
    new Map((await listVendors(ids)).map((v) => [v.vendorId, { code: v.code, name: v.name }])),
  compute: ({ open, unallocated, asOf, names, tree }) =>
    calculateApAging({ partA: open, partB: unallocated, asOf, vendors: names, tree }),
})

export function computeApAging(filter: AppContextFilter): Promise<ApAgingResult> {
  return memoMetric('apAging', filter, () => computeApAgingUncached(filter))
}

/** The rows of the vendor table (no GL read, no reconciliation). */
export async function computeApAgingParties(filter: AppContextFilter) {
  return (await payables.core(filter)).computed.byVendor
}

async function computeApAgingUncached(filter: AppContextFilter): Promise<ApAgingResult> {
  const meta = buildMetricMeta(filter)
  const { computed, names, tree } = await payables.core(filter)

  // The comparison total and the GL reconciliation do not depend on each other
  const controlCoaIds = computed.controlAccounts.map((a) => a.coaId)
  const [compareTotal, glTotal] = await Promise.all([
    payables.compareTotal(filter, names, tree),
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
