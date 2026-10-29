import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D } from '~/lib/core/money'
import { addDays } from '~/lib/format/date'
import type { Breakdown, Id, MetricMeta, Money } from '~/lib/core/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedEntities,
  getCachedPeriods,
} from '~/server/context'
import { memoMetric } from '~/server/cache'
import { loadAccountMapping } from '~/server/services/shared/mapping.helper'
import { resolveBaskets } from '~/lib/finance/coa/basket-resolver'
import { expensePaidAllocated, expensePaidUnallocated } from '~/server/repo/expense-paid.repo'
import { listVendors } from '~/server/repo/party.repo'
import { linesOfCashJournals } from '~/server/repo/cashflow.repo'
import { allocateCash, makeIsOurCash } from '~/lib/finance/cash/cashflow'
import { isDirectExpenseGroup } from '~/lib/finance/coa/account-groups'
import {
  AP_BILL_ITEM_TYPES,
  computeExpensePaidBreakdown,
  type DirectExpensePortion,
} from '~/lib/finance/ap-ar/expense-paid'
import { allCashAccountIds } from '~/server/services/cash-flow.service'

export type ExpensePaidResult = {
  meta: MetricMeta
  total: Money
  apPayments: Money
  unallocatedPayments: Money
  directPayments: Money
  byCategory: Breakdown[]
  byEntity: Array<{ code: string; name: string; amount: Money }>
}

export function computeExpensePaid(filter: AppContextFilter): Promise<ExpensePaidResult> {
  return memoMetric('expensePaid', filter, () => computeExpensePaidUncached(filter))
}

async function computeExpensePaidUncached(filter: AppContextFilter): Promise<ExpensePaidResult> {
  const meta = buildMetricMeta(filter)
  const [tree, periods, { entities }] = await Promise.all([
    getCachedCoaTree(),
    getCachedPeriods(),
    getCachedEntities(),
  ])

  const resolved = resolveBaskets(await loadAccountMapping(tree), tree)
  const d1 = filter.d1
  const d2PlusOne = addDays(filter.asOf, 1)

  // Cash and bank only count as "paid"; the lines are read for the widest cash list so Cash Flow shares the read.
  const cashAndBankIds = Array.from(new Set([...resolved.cash, ...resolved.bank]))
  const activePeriods = periods.filter((p) => filter.periodIds.includes(p.periodeId))
  const readsLines = cashAndBankIds.length > 0 && activePeriods.length > 0

  // 1. AP card payments and the journal lines are independent reads
  const [allocated, unallocated, lines] = await Promise.all([
    expensePaidAllocated(d1, d2PlusOne, filter.locationIds),
    expensePaidUnallocated(d1, d2PlusOne, filter.locationIds),
    readsLines
      ? linesOfCashJournals({
          periods: activePeriods,
          segCol: filter.entitySegmentColumn,
          segIds: filter.segmentDetailIds,
          cashCoaIds: allCashAccountIds(resolved),
        })
      : Promise.resolve([]),
  ])

  // 2. Vendor lookup
  const vendorIds = Array.from(
    new Set([...allocated.map((a) => a.vendorId), ...unallocated.map((u) => u.vendorId)].filter(Boolean)),
  )
  const vendors = await listVendors(vendorIds)
  const vendorNames = new Map(vendors.map((v) => [v.vendorId, { code: v.code, name: v.name }]))

  // 3. Direct payments (cash & bank only), each portion tied to the entity of its expense line
  const segToLoc = new Map<Id, Id>()
  for (const e of entities) for (const sd of e.segmentDetailIds) segToLoc.set(sd, e.locationId)

  const directByLocation = new Map<Id, Decimal>()
  const portions = allocateCash(lines, makeIsOurCash(cashAndBankIds, filter.segmentDetailIds))
  const direct: DirectExpensePortion[] = portions.map((p) => {
    const accountGroup = tree.byId.get(p.counterCoaId)?.accountGroup ?? ''
    const loc = p.counterSegmentId ? segToLoc.get(p.counterSegmentId) : undefined
    if (loc && isDirectExpenseGroup(accountGroup) && D(p.portion).lt(0)) {
      directByLocation.set(loc, (directByLocation.get(loc) ?? D(0)).plus(D(p.portion).abs()))
    }
    return { counterCoaId: p.counterCoaId, accountGroup, portion: p.portion }
  })

  // 4. Compute totals and category breakdown
  const computed = computeExpensePaidBreakdown({ allocated, unallocated, direct, vendorNames, tree })

  // 5. By Entity: index every source by location once, then read per entity
  const apByLocation = new Map<Id, Decimal>()
  for (const a of allocated) {
    if (AP_BILL_ITEM_TYPES.has(a.itemType)) {
      apByLocation.set(a.locationId, (apByLocation.get(a.locationId) ?? D(0)).plus(D(a.detailSum)))
    }
  }
  const unallocatedByLocation = new Map<Id, Decimal>()
  for (const u of unallocated) {
    unallocatedByLocation.set(u.locationId, (unallocatedByLocation.get(u.locationId) ?? D(0)).plus(D(u.signedAmount).negated()))
  }

  const targetEntities =
    filter.locationIds === 'all' ? entities : entities.filter((e) => filter.locationIds.includes(e.locationId))

  const byEntity = targetEntities.map((e) => {
    const amount = (apByLocation.get(e.locationId) ?? D(0))
      .plus(unallocatedByLocation.get(e.locationId) ?? D(0))
      .plus(directByLocation.get(e.locationId) ?? D(0))
    return { code: e.code, name: e.name, amount: amount.toFixed(2) }
  })

  return {
    meta,
    total: computed.total,
    apPayments: computed.apPayments,
    unallocatedPayments: computed.unallocatedPayments,
    directPayments: computed.directPayments,
    byCategory: computed.byCategory,
    byEntity,
  }
}
