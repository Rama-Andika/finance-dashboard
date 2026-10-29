import '@tanstack/react-start/server-only'
import { D, sum } from '~/lib/finance/money'
import { addDays } from '~/lib/format/date'
import type { Id, MetricMeta, Money } from '~/lib/finance/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
} from '~/server/context'
import {
  arAgingPartA,
  arAgingPartB,
  listCustomers,
} from '~/server/repo/apar.repo'
import { balancesAt } from '~/server/services/balance.service'
import {
  computeArAging as calculateArAging,
  type CustomerAgingSummary,
} from '~/lib/finance/apar'
import type { AgingBucket } from '~/lib/finance/aging'

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

export async function computeArAging(
  filter: AppContextFilter,
): Promise<ArAgingResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()

  const asOfPlusOne = addDays(filter.asOf, 1)

  // 1. Fetch Part A and Part B items
  const partA = await arAgingPartA(asOfPlusOne, filter.locationIds)
  const partB = await arAgingPartB(asOfPlusOne, filter.locationIds)

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

  // 4. Compare total
  let compareTotal: Money | null = null
  if (filter.compare && filter.compare.asOf) {
    const cmpAsOfPlusOne = addDays(filter.compare.asOf, 1)
    const cmpA = await arAgingPartA(cmpAsOfPlusOne, filter.locationIds)
    const cmpB = await arAgingPartB(cmpAsOfPlusOne, filter.locationIds)
    const cmpComputed = calculateArAging({
      partA: cmpA,
      partB: cmpB,
      asOf: filter.compare.asOf,
      customers: customerMap,
      tree,
    })
    compareTotal = cmpComputed.total
  }

  // 5. GL reconciliation
  const controlCoaIds = computed.controlAccounts.map((a) => a.coaId)
  let glTotal = '0.00'
  if (controlCoaIds.length > 0) {
    const glRes = await balancesAt({
      asOf: filter.asOf,
      coaIds: controlCoaIds,
      filter,
    })
    glTotal = sum(controlCoaIds.map((id) => glRes.byCoa.get(id) ?? '0.00'))
  }

  const diff = D(glTotal).minus(D(computed.total)).toFixed(2)
  const inSync = Math.abs(Number(diff)) < 1

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
