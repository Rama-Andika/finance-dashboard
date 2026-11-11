import Decimal from 'decimal.js'
import { D, addTo } from '../../core/money'
import type { Breakdown, Id, Money } from '../../core/types'
import { type CoaTree, postableDescendants } from '../coa/coa-tree'
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

type VendorNames = Map<Id, { code: string; name: string }>

/** A category whose children are vendors: the amounts of the same vendor are summed. */
function vendorCategory(
  id: string,
  label: string,
  amounts: Array<{ vendorId: Id; amount: Decimal }>,
  vendorNames: VendorNames,
): { category: Breakdown; total: Decimal } {
  const byVendor = new Map<Id, Decimal>()
  let total = D(0)
  for (const { vendorId, amount } of amounts) {
    total = total.plus(amount)
    addTo(byVendor, vendorId, amount)
  }

  const children: Breakdown[] = Array.from(byVendor, ([vendorId, amount]) => {
    const vendor = vendorNames.get(vendorId)
    return {
      id: vendorId,
      label: vendor?.name || '', // empty = unknown vendor (CARD_PARTY_MISSING)
      code: vendor?.code,
      amount: amount.toFixed(2),
    }
  })
  return { category: { id, label, amount: total.toFixed(2), children }, total }
}

/** Direct payments of COGS / expense accounts (cash out, portion < 0), grouped in the folders of the account tree. */
function directCategories(direct: DirectExpensePortion[], tree: CoaTree): { categories: Breakdown[]; total: Decimal } {
  let total = D(0)
  const byCoa = new Map<Id, Decimal>()
  for (const item of direct) {
    if (isDirectExpenseGroup(item.accountGroup) && D(item.portion).lt(0)) {
      const amount = D(item.portion).abs()
      total = total.plus(amount)
      addTo(byCoa, item.counterCoaId, amount)
    }
  }

  const categories: Breakdown[] = []
  for (const folder of [...groupFolders(tree, 'Cost Of Sales'), ...groupFolders(tree, 'Expense')]) {
    const accountIds = folder.status === 'POSTABLE' ? [folder.coaId] : postableDescendants(tree, folder.coaId)

    let folderSum = D(0)
    const children: Breakdown[] = []
    for (const coaId of accountIds) {
      const amount = byCoa.get(coaId)
      if (!amount || amount.isZero()) continue
      folderSum = folderSum.plus(amount)
      const node = tree.byId.get(coaId)
      children.push({ id: coaId, label: node?.name ?? `Account ${coaId}`, code: node?.code, amount: amount.toFixed(2) })
    }

    if (!folderSum.isZero()) {
      categories.push({
        id: folder.coaId,
        label: folder.name,
        code: folder.code,
        amount: folderSum.toFixed(2),
        children,
      })
    }
  }
  return { categories, total }
}

export function computeExpensePaidBreakdown(input: {
  allocated: ExpensePaidAllocatedItem[]
  unallocated: ExpensePaidUnallocatedItem[]
  direct: DirectExpensePortion[]
  vendorNames: VendorNames
  tree: CoaTree
}): {
  total: Money
  apPayments: Money
  unallocatedPayments: Money
  directPayments: Money
  byCategory: Breakdown[]
} {
  const { allocated, unallocated, direct, vendorNames, tree } = input

  // 1. AP Bill payments (itemType in {0, 1, 2, 4, 5, 6, 12}).
  // The allocation of a payment card has the opposite sign of the item it settles (a payment is negative, a credit note
  // used in the payment is positive), so the negated sum is the money paid out.
  const apCategory = vendorCategory(
    'apBills',
    'AP bill payments', // translated on the page by id
    allocated
      .filter((item) => AP_BILL_ITEM_TYPES.has(item.itemType))
      .map((item) => ({ vendorId: item.vendorId, amount: D(item.detailSum).negated() })),
    vendorNames,
  )

  // 2. Unallocated card payments. signedAmount = amount * in_out, so the negated value is the positive payment out.
  const unallocCategory = vendorCategory(
    'unallocated',
    'Unallocated payments', // translated on the page by id
    unallocated.map((item) => ({ vendorId: item.vendorId, amount: D(item.signedAmount).negated() })),
    vendorNames,
  )

  // 3. Direct payments (COGS + Expense, portion < 0)
  const directResult = directCategories(direct, tree)

  return {
    total: apCategory.total.plus(unallocCategory.total).plus(directResult.total).toFixed(2),
    apPayments: apCategory.total.toFixed(2),
    unallocatedPayments: unallocCategory.total.toFixed(2),
    directPayments: directResult.total.toFixed(2),
    byCategory: [apCategory.category, unallocCategory.category, ...directResult.categories],
  }
}
