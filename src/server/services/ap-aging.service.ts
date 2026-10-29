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
  apAgingPartA,
  apAgingPartB,
  listVendors,
} from '~/server/repo/apar.repo'
import { balancesAt } from '~/server/services/balance.service'
import {
  computeApAging as calculateApAging,
  type VendorAgingSummary,
} from '~/lib/finance/apar'
import type { AgingBucket } from '~/lib/finance/aging'

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

export async function computeApAging(
  filter: AppContextFilter,
): Promise<ApAgingResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()

  const asOfPlusOne = addDays(filter.asOf, 1)

  // 1. Fetch Part A and Part B items
  const partA = await apAgingPartA(asOfPlusOne, filter.locationIds)
  const partB = await apAgingPartB(asOfPlusOne, filter.locationIds)

  // 2. Fetch vendor info
  const vendorIds = Array.from(
    new Set([...partA.map((a) => a.vendorId), ...partB.map((b) => b.vendorId)].filter(Boolean)),
  )
  const vendors = await listVendors(vendorIds)
  const vendorMap = new Map(
    vendors.map((v) => [v.vendorId, { code: v.code, name: v.name }]),
  )

  // 3. Compute aging
  const computed = calculateApAging({
    partA,
    partB,
    asOf: filter.asOf,
    vendors: vendorMap,
    tree,
  })

  // 4. Compare total
  let compareTotal: Money | null = null
  if (filter.compare && filter.compare.asOf) {
    const cmpAsOfPlusOne = addDays(filter.compare.asOf, 1)
    const cmpA = await apAgingPartA(cmpAsOfPlusOne, filter.locationIds)
    const cmpB = await apAgingPartB(cmpAsOfPlusOne, filter.locationIds)
    const cmpComputed = calculateApAging({
      partA: cmpA,
      partB: cmpB,
      asOf: filter.compare.asOf,
      vendors: vendorMap,
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
