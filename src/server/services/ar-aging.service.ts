import '@tanstack/react-start/server-only'
import { D, sum } from '~/lib/finance/money'
import { addDays } from '~/lib/format/date'
import { memoMetric } from '~/server/cache'
import type { Id, MetricMeta, Money } from '~/lib/finance/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
} from '~/server/context'
import {
  arOpenInvoices,
  arUnallocatedReceipts,
  listCustomers,
} from '~/server/repo/apar.repo'
import { balancesAt } from '~/server/services/balance.service'
import {
  computeArAging as calculateArAging,
  type CustomerAgingSummary,
} from '~/lib/finance/apar'
import type { AgingBucket } from '~/lib/finance/aging'
import type { CoaTree } from '~/lib/finance/coa-tree'

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

async function computeArAgingUncached(filter: AppContextFilter): Promise<ArAgingResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()

  const asOfPlusOne = addDays(filter.asOf, 1)

  // 1. Fetch Part A and Part B items
  const [partA, partB] = await Promise.all([
    arOpenInvoices(asOfPlusOne, filter.locationIds),
    arUnallocatedReceipts(asOfPlusOne, filter.locationIds),
  ])

  // 2. Fetch customer info
  const customerIds = Array.from(
    new Set([...partA.map((a) => a.customerId), ...partB.map((b) => b.customerId)].filter(Boolean)),
  )
  const customers = await listCustomers(customerIds)
  const customerMap = new Map(
    customers.map((c) => [c.customerId, { code: c.code, name: c.name }]),
  )

  // 3. Compute aging
  const computed = calculateArAging({
    partA,
    partB,
    asOf: filter.asOf,
    customers: customerMap,
    tree,
  })

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
