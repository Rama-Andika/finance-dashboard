import '@tanstack/react-start/server-only'
import type { Id, MetricMeta, Money } from '~/lib/core/types'
import type { AppContextFilter } from '~/server/context'
import { arOpenInvoices, arUnallocatedReceipts } from '~/server/repo/aging.repo'
import { listCustomers } from '~/server/repo/party.repo'
import { createAgingMetric } from '~/server/services/shared/aging-metric'
import type { AgingReconciliation } from '~/lib/finance/ap-ar/aging-reconciliation'
import {
  computeArAging as calculateArAging,
  type CustomerAgingSummary,
} from '~/lib/finance/ap-ar/apar'
import type { AgingBucket } from '~/lib/finance/ap-ar/aging'

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

const receivables = createAgingMetric({
  metricName: 'arAging',
  source: {
    cacheName: 'arAgingCore',
    openItems: (asOfPlusOne, locationIds) => arOpenInvoices(asOfPlusOne, locationIds),
    unallocatedItems: (asOfPlusOne, locationIds) => arUnallocatedReceipts(asOfPlusOne, locationIds),
    openPartyId: (item) => item.customerId,
    unallocatedPartyId: (item) => item.customerId,
    loadPartyNames: async (ids) =>
      new Map((await listCustomers(ids)).map((c) => [c.customerId, { code: c.code, name: c.name }])),
    compute: ({ open, unallocated, asOf, names, tree }) =>
      calculateArAging({ partA: open, partB: unallocated, asOf, customers: names, tree }),
  },
  toResult: ({ meta, computed, compareTotal, reconciliation }): ArAgingResult => ({
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
    reconciliation,
  }),
})

export function computeArAging(filter: AppContextFilter): Promise<ArAgingResult> {
  return receivables.compute(filter)
}

/** The rows of the customer table (no GL read, no reconciliation). */
export async function computeArAgingParties(filter: AppContextFilter) {
  return (await receivables.core(filter)).computed.byCustomer
}
