import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D } from '~/lib/finance/money'
import { addDays } from '~/lib/format/date'
import type { Breakdown, Id, MetricMeta, Money } from '~/lib/finance/types'
import {
  type AppContextFilter,
  buildMetricMeta,
  getCachedCoaTree,
  getCachedEntities,
  getCachedPeriods,
} from '~/server/context'
import { loadAccountMapping } from '~/server/services/mapping.helper'
import { resolveBaskets } from '~/lib/finance/basket-resolver'
import {
  expensePaidAllocated,
  expensePaidUnallocated,
  listVendors,
} from '~/server/repo/apar.repo'
import { linesOfCashJournals } from '~/server/repo/cashflow.repo'
import { allocateCash, type CfLine } from '~/lib/finance/cashflow'
import {
  computeExpensePaidBreakdown,
  type DirectExpensePortion,
} from '~/lib/finance/expense-paid'

export type ExpensePaidResult = {
  meta: MetricMeta
  total: Money
  apPayments: Money
  unallocatedPayments: Money
  directPayments: Money
  byCategory: Breakdown[]
  byEntity: Array<{ code: string; name: string; amount: Money }>
}

export async function computeExpensePaid(
  filter: AppContextFilter,
): Promise<ExpensePaidResult> {
  const meta = buildMetricMeta(filter)
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()
  const { entities } = await getCachedEntities()

  const mapping = await loadAccountMapping(tree)
  const resolved = resolveBaskets(mapping, tree)

  const d1 = filter.d1
  const d2PlusOne = addDays(filter.asOf, 1)

  // 1. AP card payments
  const allocated = await expensePaidAllocated(d1, d2PlusOne, filter.locationIds)
  const unallocated = await expensePaidUnallocated(d1, d2PlusOne, filter.locationIds)

  // 2. Vendor lookup
  const vendorIds = Array.from(
    new Set(
      [...allocated.map((a) => a.vendorId), ...unallocated.map((u) => u.vendorId)].filter(
        Boolean,
      ),
    ),
  )
  const vendors = await listVendors(vendorIds)
  const vendorNames = new Map(
    vendors.map((v) => [v.vendorId, { code: v.code, name: v.name }]),
  )

  // 3. Direct payments (cash & bank only)
  const cashAndBankIds = Array.from(
    new Set([...resolved.cash, ...resolved.bank]),
  )

  let direct: DirectExpensePortion[] = []
  const directByLocation = new Map<Id, Decimal>()

  if (cashAndBankIds.length > 0 && filter.periodIds.length > 0) {
    const activePeriods = periods.filter((p) =>
      filter.periodIds.includes(p.periodeId),
    )
    const lines = await linesOfCashJournals({
      periods: activePeriods,
      segCol: filter.entitySegmentColumn,
      segIds: filter.segmentDetailIds,
      cashCoaIds: cashAndBankIds,
    })

    const segIdSet =
      filter.segmentDetailIds === 'all' ? null : new Set(filter.segmentDetailIds)

    const isOurCash = (l: CfLine) => {
      if (!cashAndBankIds.includes(l.coaId)) return false
      if (!segIdSet) return true
      return l.segmentDetailId ? segIdSet.has(l.segmentDetailId) : false
    }

    const portions = allocateCash(lines, isOurCash)

    direct = portions.map((p) => {
      const node = tree.byId.get(p.counterCoaId)
      return {
        counterCoaId: p.counterCoaId,
        accountGroup: node?.accountGroup ?? '',
        portion: p.portion,
      }
    })

    // Track direct payments per segmentDetailId/location
    const segToLoc = new Map<Id, Id>()
    for (const e of entities) {
      for (const sd of e.segmentDetailIds) {
        segToLoc.set(sd, e.locationId)
      }
    }

    for (const l of lines) {
      if (l.segmentDetailId) {
        const locId = segToLoc.get(l.segmentDetailId)
        if (locId) {
          const node = tree.byId.get(l.coaId)
          if (node && ['Cost Of Sales', 'Expense'].includes(node.accountGroup)) {
            const debetMinusCredit = D(l.debet).minus(D(l.credit))
            if (debetMinusCredit.gt(0)) {
              const curr = directByLocation.get(locId) ?? D(0)
              directByLocation.set(locId, curr.plus(debetMinusCredit))
            }
          }
        }
      }
    }
  }

  // 4. Compute totals and category breakdown
  const computed = computeExpensePaidBreakdown({
    allocated,
    unallocated,
    direct,
    vendorNames,
    tree,
  })

  // 5. By Entity
  const targetEntities =
    filter.locationIds === 'all'
      ? entities
      : entities.filter((e) => filter.locationIds.includes(e.locationId))

  const byEntity = targetEntities.map((e) => {
    let entSum = D(0)

    for (const a of allocated) {
      if (a.locationId === e.locationId) {
        if ([0, 1, 2, 4, 5, 6, 12].includes(a.itemType)) {
          entSum = entSum.plus(D(a.detailSum))
        }
      }
    }

    for (const u of unallocated) {
      if (u.locationId === e.locationId) {
        entSum = entSum.plus(D(u.signedAmount).negated())
      }
    }

    const directAmt = directByLocation.get(e.locationId) ?? D(0)
    entSum = entSum.plus(directAmt)

    return {
      code: e.code,
      name: e.name,
      amount: entSum.toFixed(2),
    }
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
