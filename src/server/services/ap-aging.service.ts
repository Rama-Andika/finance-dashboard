import '@tanstack/react-start/server-only'
import type { Id, MetricMeta, Money } from '~/lib/core/types'
import type { AppContextFilter } from '~/server/context'
import { apOpenInvoices, apUnallocatedPayments } from '~/server/repo/aging.repo'
import { listVendors } from '~/server/repo/party.repo'
import { createAgingMetric } from '~/server/services/shared/aging-metric'
import type { AgingReconciliation } from '~/lib/finance/ap-ar/aging-reconciliation'
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

const payables = createAgingMetric({
  metricName: 'apAging',
  source: {
    cacheName: 'apAgingCore',
    openItems: (asOfPlusOne, locationIds) => apOpenInvoices(asOfPlusOne, locationIds),
    unallocatedItems: (asOfPlusOne, locationIds) => apUnallocatedPayments(asOfPlusOne, locationIds),
    openPartyId: (item) => item.vendorId,
    unallocatedPartyId: (item) => item.vendorId,
    loadPartyNames: async (ids) =>
      new Map((await listVendors(ids)).map((v) => [v.vendorId, { code: v.code, name: v.name }])),
    compute: ({ open, unallocated, asOf, names, tree }) =>
      calculateApAging({ partA: open, partB: unallocated, asOf, vendors: names, tree }),
  },
  toResult: ({ meta, computed, compareTotal, reconciliation }): ApAgingResult => ({
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
    reconciliation,
  }),
})

export function computeApAging(filter: AppContextFilter): Promise<ApAgingResult> {
  return payables.compute(filter)
}

/** The rows of the vendor table (no GL read, no reconciliation). */
export async function computeApAgingParties(filter: AppContextFilter) {
  return (await payables.core(filter)).computed.byVendor
}
