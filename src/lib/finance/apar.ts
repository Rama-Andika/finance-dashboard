import Decimal from 'decimal.js'
import { D } from './money'
import {
  type AgingBucket,
  AGING_BUCKETS,
  OVERDUE_BUCKETS,
  bucketOf,
} from './aging'
import type { Id, IsoDate, Money } from './types'
import type { CoaTree } from './coa-tree'
import type {
  ApAgingPartARow,
  ApAgingPartBRow,
  ArAgingPartARow,
  ArAgingPartBRow,
} from '~/server/repo/apar.repo'

export type VendorAgingSummary = {
  vendorId: Id
  code: string
  name: string
  total: Money
  buckets: Record<AgingBucket, Money>
}

export type CustomerAgingSummary = {
  customerId: Id
  code: string
  name: string
  total: Money
  buckets: Record<AgingBucket, Money>
}

export function initBuckets(): Record<AgingBucket, Decimal> {
  return {
    overdue0_30: D(0),
    overdue31_60: D(0),
    overdue61_90: D(0),
    overdue90plus: D(0),
    due1_30: D(0),
    due31_60: D(0),
    due61_90: D(0),
    due90plus: D(0),
  }
}

export function formatBuckets(
  buckets: Record<AgingBucket, Decimal>,
): Record<AgingBucket, Money> {
  const result: Partial<Record<AgingBucket, Money>> = {}
  for (const b of AGING_BUCKETS) {
    result[b] = (buckets[b] ?? D(0)).toFixed(2)
  }
  return result as Record<AgingBucket, Money>
}

export function computeApAging(input: {
  partA: ApAgingPartARow[]
  partB: ApAgingPartBRow[]
  asOf: IsoDate
  vendors: Map<Id, { code: string; name: string }>
  tree: CoaTree
}): {
  total: Money
  unpaidBills: Money
  vendorCredits: Money
  unallocatedPayments: Money
  buckets: Record<AgingBucket, Money>
  overdueSubtotal: Money
  byVendor: VendorAgingSummary[]
  controlAccounts: Array<{ coaId: Id; code: string; name: string }>
} {
  const { partA, partB, asOf, vendors, tree } = input

  let unpaidBillsDec = D(0)
  let vendorCreditsDec = D(0)
  let unallocatedPaymentsDec = D(0)

  const overallBuckets = initBuckets()

  type VendorAccum = {
    total: Decimal
    buckets: Record<AgingBucket, Decimal>
  }
  const vendorMap = new Map<Id, VendorAccum>()

  function getVendorAccum(vendorId: Id): VendorAccum {
    let acc = vendorMap.get(vendorId)
    if (!acc) {
      acc = {
        total: D(0),
        buckets: initBuckets(),
      }
      vendorMap.set(vendorId, acc)
    }
    return acc
  }

  // Part A items
  const controlCoaIds = new Set<Id>()

  for (const a of partA) {
    const bal = D(a.balance)
    if (a.coaId) controlCoaIds.add(a.coaId)

    if (bal.gt(0)) {
      unpaidBillsDec = unpaidBillsDec.plus(bal)
    } else {
      vendorCreditsDec = vendorCreditsDec.plus(bal)
    }

    // Bucket calculation: use dueDate or txDate if dueDate is null
    const effectiveDueDate = a.dueDate || a.txDate
    const bucket = bucketOf(asOf, effectiveDueDate)
    overallBuckets[bucket] = overallBuckets[bucket].plus(bal)

    const vAcc = getVendorAccum(a.vendorId)
    vAcc.total = vAcc.total.plus(bal)
    vAcc.buckets[bucket] = vAcc.buckets[bucket].plus(bal)
  }

  // Part B items (unallocated payments, always negative or positive based on amount * in_out)
  for (const b of partB) {
    const bal = D(b.balance)
    if (b.coaId) controlCoaIds.add(b.coaId)

    unallocatedPaymentsDec = unallocatedPaymentsDec.plus(bal)

    // Unallocated payments are placed in overdue0_30 (or txDate age)
    const bucket = bucketOf(asOf, b.txDate)
    overallBuckets[bucket] = overallBuckets[bucket].plus(bal)

    const vAcc = getVendorAccum(b.vendorId)
    vAcc.total = vAcc.total.plus(bal)
    vAcc.buckets[bucket] = vAcc.buckets[bucket].plus(bal)
  }

  // Net total
  const netTotalDec = unpaidBillsDec
    .plus(vendorCreditsDec)
    .plus(unallocatedPaymentsDec)

  let overdueSubtotalDec = D(0)
  for (const b of OVERDUE_BUCKETS) {
    overdueSubtotalDec = overdueSubtotalDec.plus(overallBuckets[b])
  }

  // byVendor array
  const byVendor: VendorAgingSummary[] = Array.from(vendorMap.entries()).map(
    ([vendorId, acc]) => {
      const v = vendors.get(vendorId)
      return {
        vendorId,
        code: v?.code || '',
        name: v?.name || '(Vendor tidak dikenal)',
        total: acc.total.toFixed(2),
        buckets: formatBuckets(acc.buckets),
      }
    },
  )

  // Control accounts list
  const controlAccounts = Array.from(controlCoaIds).map((coaId) => {
    const node = tree.byId.get(coaId)
    return {
      coaId,
      code: node?.code || '',
      name: node?.name || `Account ${coaId}`,
    }
  })

  return {
    total: netTotalDec.toFixed(2),
    unpaidBills: unpaidBillsDec.toFixed(2),
    vendorCredits: vendorCreditsDec.toFixed(2),
    unallocatedPayments: unallocatedPaymentsDec.toFixed(2),
    buckets: formatBuckets(overallBuckets),
    overdueSubtotal: overdueSubtotalDec.toFixed(2),
    byVendor,
    controlAccounts,
  }
}

export function computeArAging(input: {
  partA: ArAgingPartARow[]
  partB: ArAgingPartBRow[]
  asOf: IsoDate
  customers: Map<Id, { code: string; name: string }>
  tree: CoaTree
}): {
  total: Money
  unpaidInvoices: Money
  customerCredits: Money
  unallocatedReturns: Money
  nonTrade: Money
  buckets: Record<AgingBucket, Money>
  overdueSubtotal: Money
  byCustomer: CustomerAgingSummary[]
  controlAccounts: Array<{ coaId: Id; code: string; name: string }>
} {
  const { partA, partB, asOf, customers, tree } = input

  let unpaidInvoicesDec = D(0)
  let customerCreditsDec = D(0)
  let unallocatedReturnsDec = D(0)
  let nonTradeDec = D(0)

  const overallBuckets = initBuckets()

  type CustAccum = {
    total: Decimal
    buckets: Record<AgingBucket, Decimal>
  }
  const custMap = new Map<Id, CustAccum>()

  function getCustAccum(customerId: Id): CustAccum {
    let acc = custMap.get(customerId)
    if (!acc) {
      acc = {
        total: D(0),
        buckets: initBuckets(),
      }
      custMap.set(customerId, acc)
    }
    return acc
  }

  const controlCoaIds = new Set<Id>()

  for (const a of partA) {
    const bal = D(a.balance)
    if (a.coaId) controlCoaIds.add(a.coaId)

    if (bal.gt(0)) {
      unpaidInvoicesDec = unpaidInvoicesDec.plus(bal)
    } else {
      customerCreditsDec = customerCreditsDec.plus(bal)
    }

    if (a.itemType === 3) {
      nonTradeDec = nonTradeDec.plus(bal)
    }

    const effectiveDueDate = a.dueDate || a.txDate
    const bucket = bucketOf(asOf, effectiveDueDate)
    overallBuckets[bucket] = overallBuckets[bucket].plus(bal)

    const cAcc = getCustAccum(a.customerId)
    cAcc.total = cAcc.total.plus(bal)
    cAcc.buckets[bucket] = cAcc.buckets[bucket].plus(bal)
  }

  for (const b of partB) {
    const bal = D(b.balance)
    if (b.coaId) controlCoaIds.add(b.coaId)

    unallocatedReturnsDec = unallocatedReturnsDec.plus(bal)

    const bucket = bucketOf(asOf, b.txDate)
    overallBuckets[bucket] = overallBuckets[bucket].plus(bal)

    const cAcc = getCustAccum(b.customerId)
    cAcc.total = cAcc.total.plus(bal)
    cAcc.buckets[bucket] = cAcc.buckets[bucket].plus(bal)
  }

  const netTotalDec = unpaidInvoicesDec
    .plus(customerCreditsDec)
    .plus(unallocatedReturnsDec)

  let overdueSubtotalDec = D(0)
  for (const b of OVERDUE_BUCKETS) {
    overdueSubtotalDec = overdueSubtotalDec.plus(overallBuckets[b])
  }

  const byCustomer: CustomerAgingSummary[] = Array.from(custMap.entries()).map(
    ([customerId, acc]) => {
      const c = customers.get(customerId)
      return {
        customerId,
        code: c?.code || '',
        name: c?.name || '(Pelanggan tidak dikenal)',
        total: acc.total.toFixed(2),
        buckets: formatBuckets(acc.buckets),
      }
    },
  )

  const controlAccounts = Array.from(controlCoaIds).map((coaId) => {
    const node = tree.byId.get(coaId)
    return {
      coaId,
      code: node?.code || '',
      name: node?.name || `Account ${coaId}`,
    }
  })

  return {
    total: netTotalDec.toFixed(2),
    unpaidInvoices: unpaidInvoicesDec.toFixed(2),
    customerCredits: customerCreditsDec.toFixed(2),
    unallocatedReturns: unallocatedReturnsDec.toFixed(2),
    nonTrade: nonTradeDec.toFixed(2),
    buckets: formatBuckets(overallBuckets),
    overdueSubtotal: overdueSubtotalDec.toFixed(2),
    byCustomer,
    controlAccounts,
  }
}
