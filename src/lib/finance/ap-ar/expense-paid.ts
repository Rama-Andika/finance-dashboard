import Decimal from 'decimal.js'
import { D, sum } from '../../core/money'
import type { Breakdown, Id, Money } from '../../core/types'
import { type CoaTree, type CoaNode, postableDescendants } from '../coa/coa-tree'
import { groupFolders } from '../pnl/revenue'
import { isDirectExpenseGroup } from '../coa/account-groups'

export type ExpensePaidAllocatedItem = {
  cardId: Id
  locationId: Id
  vendorId: Id
  itemType: number
  detailSum: Money
}

export type ExpensePaidUnallocatedItem = {
  cardId: Id
  locationId: Id
  vendorId: Id
  signedAmount: Money
}

export type DirectExpensePortion = {
  counterCoaId: Id
  accountGroup: string
  portion: Money // negative for cash out
}

/** AP card types that are vendor bills for "expense paid" (data-model §6.5(a)); NOT type 3. */
export const AP_BILL_ITEM_TYPES: ReadonlySet<number> = new Set([0, 1, 2, 4, 5, 6, 12])

export function computeExpensePaidBreakdown(input: {
  allocated: ExpensePaidAllocatedItem[]
  unallocated: ExpensePaidUnallocatedItem[]
  direct: DirectExpensePortion[]
  vendorNames: Map<Id, { code: string; name: string }>
  tree: CoaTree
}): {
  total: Money
  apPayments: Money
  unallocatedPayments: Money
  directPayments: Money
  byCategory: Breakdown[]
} {
  const { allocated, unallocated, direct, vendorNames, tree } = input

  // 1. AP Bill payments (itemType in {0, 1, 2, 4, 5, 6, 12})
  let apSum = D(0)
  const apByVendor = new Map<Id, Decimal>()

  for (const item of allocated) {
    if (AP_BILL_ITEM_TYPES.has(item.itemType)) {
      const amt = D(item.detailSum)
      apSum = apSum.plus(amt)

      const curr = apByVendor.get(item.vendorId) ?? D(0)
      apByVendor.set(item.vendorId, curr.plus(amt))
    }
  }

  const apVendorChildren: Breakdown[] = Array.from(apByVendor.entries()).map(
    ([vId, amt]) => {
      const v = vendorNames.get(vId)
      return {
        id: vId,
        label: v?.name || '', // empty = unknown vendor (Q7)
        code: v?.code,
        amount: amt.toFixed(2),
      }
    },
  )

  const apCategory: Breakdown = {
    id: 'apBills',
    label: 'AP bill payments', // translated on the page by id
    amount: apSum.toFixed(2),
    children: apVendorChildren,
  }

  // 2. Unallocated card payments: - signedAmount (where in_out = -1 -> positive)
  let unallocSum = D(0)
  const unallocByVendor = new Map<Id, Decimal>()

  for (const item of unallocated) {
    // signedAmount = amount * in_out. -signedAmount gives the positive payment out.
    const amt = D(item.signedAmount).negated()
    unallocSum = unallocSum.plus(amt)

    const curr = unallocByVendor.get(item.vendorId) ?? D(0)
    unallocByVendor.set(item.vendorId, curr.plus(amt))
  }

  const unallocVendorChildren: Breakdown[] = Array.from(
    unallocByVendor.entries(),
  ).map(([vId, amt]) => {
    const v = vendorNames.get(vId)
    return {
      id: vId,
      label: v?.name || '', // empty = unknown vendor (Q7)
      code: v?.code,
      amount: amt.toFixed(2),
    }
  })

  const unallocCategory: Breakdown = {
    id: 'unallocated',
    label: 'Unallocated payments', // translated on the page by id
    amount: unallocSum.toFixed(2),
    children: unallocVendorChildren,
  }

  // 3. Direct payments (COGS + Expense, portion < 0)
  let directSum = D(0)
  const directByCoa = new Map<Id, Decimal>()

  for (const item of direct) {
    if (isDirectExpenseGroup(item.accountGroup) && D(item.portion).lt(0)) {
      const amt = D(item.portion).abs()
      directSum = directSum.plus(amt)

      const curr = directByCoa.get(item.counterCoaId) ?? D(0)
      directByCoa.set(item.counterCoaId, curr.plus(amt))
    }
  }

  // Folders for direct expense accounts
  const expenseFolders = [
    ...groupFolders(tree, 'Cost Of Sales'),
    ...groupFolders(tree, 'Expense'),
  ]

  const directCategories: Breakdown[] = []
  for (const f of expenseFolders) {
    const descs =
      f.status === 'POSTABLE' ? [f.coaId] : postableDescendants(tree, f.coaId)

    let folderSum = D(0)
    const children: Breakdown[] = []

    for (const coaId of descs) {
      const amt = directByCoa.get(coaId)
      if (amt && !amt.isZero()) {
        folderSum = folderSum.plus(amt)
        const node = tree.byId.get(coaId)
        children.push({
          id: coaId,
          label: node?.name ?? `Account ${coaId}`,
          code: node?.code,
          amount: amt.toFixed(2),
        })
      }
    }

    if (!folderSum.isZero()) {
      directCategories.push({
        id: f.coaId,
        label: f.name,
        code: f.code,
        amount: folderSum.toFixed(2),
        children,
      })
    }
  }

  const total = apSum.plus(unallocSum).plus(directSum).toFixed(2)

  return {
    total,
    apPayments: apSum.toFixed(2),
    unallocatedPayments: unallocSum.toFixed(2),
    directPayments: directSum.toFixed(2),
    byCategory: [apCategory, unallocCategory, ...directCategories],
  }
}
