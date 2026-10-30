import '@tanstack/react-start/server-only'
import { memoMetric } from '~/server/cache'
import type { Id, MetricMeta, Money } from '~/lib/core/types'
import { type AppContextFilter, buildMetricMeta } from '~/server/context'
import { arOpenInvoices, arUnallocatedReceipts } from '~/server/repo/aging.repo'
import { listCustomers } from '~/server/repo/party.repo'
import { controlAccountsGlTotal } from '~/server/services/shared/aging.helper'
import { createAgingReader } from '~/server/services/shared/aging-reader'
import { reconcileAging, type AgingReconciliation } from '~/lib/finance/ap-ar/aging-reconciliation'
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

const receivables = createAgingReader({
  cacheName: 'arAgingCore',
  openItems: (asOfPlusOne, locationIds) => arOpenInvoices(asOfPlusOne, locationIds),
  unallocatedItems: (asOfPlusOne, locationIds) => arUnallocatedReceipts(asOfPlusOne, locationIds),
  openPartyId: (item) => item.customerId,
  unallocatedPartyId: (item) => item.customerId,
  loadPartyNames: async (ids) =>
    new Map((await listCustomers(ids)).map((c) => [c.customerId, { code: c.code, name: c.name }])),
  compute: ({ open, unallocated, asOf, names, tree }) =>
    calculateArAging({ partA: open, partB: unallocated, asOf, customers: names, tree }),
})

export function computeArAging(filter: AppContextFilter): Promise<ArAgingResult> {
  return memoMetric('arAging', filter, () => computeArAgingUncached(filter))
}

/** The rows of the customer table (no GL read, no reconciliation). */
export async function computeArAgingParties(filter: AppContextFilter) {
  return (await receivables.core(filter)).computed.byCustomer
}

async function computeArAgingUncached(filter: AppContextFilter): Promise<ArAgingResult> {
  const meta = buildMetricMeta(filter)
  const { computed, names, tree } = await receivables.core(filter)

  // The comparison total and the GL reconciliation do not depend on each other
  const controlCoaIds = computed.controlAccounts.map((a) => a.coaId)
  const [compareTotal, glTotal] = await Promise.all([
    receivables.compareTotal(filter, names, tree),
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
