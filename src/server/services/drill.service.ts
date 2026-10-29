import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D } from '~/lib/finance/money'
import { addDays } from '~/lib/format/date'
import type { Id, IsoDate } from '~/lib/finance/types'
import {
  type AppContextFilter,
  getCachedCoaTree,
  getCachedEntities,
  getCachedPeriods,
} from '~/server/context'
import { journalLines, movementsByPeriods } from '~/server/repo/gl.repo'
import {
  apAgingPartA,
  arAgingPartA,
  cardSettlementHistory,
  listVendors,
  listCustomers,
} from '~/server/repo/apar.repo'
import { postableDescendants } from '~/lib/finance/coa-tree'
import { getJournalGroupKey, JOURNAL_GROUP_LABELS } from '~/lib/finance/journal-type'
import { bucketOf } from '~/lib/finance/aging'

export type DrillStepKind =
  | 'section'
  | 'folder'
  | 'account'
  | 'entity'
  | 'vendor'
  | 'customer'
  | 'bucket'
  | 'day'
  | 'channel'
  | 'date'
  | 'subrow'
  | 'card'

export type DrillStep = {
  kind: DrillStepKind
  id: string
  label: string
}

export type DrillState = {
  metric: string
  steps: DrillStep[]
}

export type DrillColumnKind = 'text' | 'code' | 'money' | 'date' | 'status'

export type DrillColumn = {
  id: string
  label: string
  kind: DrillColumnKind
}

export type DrillResult = {
  title: string
  columns: DrillColumn[]
  rows: Array<Record<string, string | null>>
  nextKind: DrillStepKind | null
  hasMore: boolean
}

function matchesBucket(asOf: IsoDate, dueDate: IsoDate, targetBucket: string): boolean {
  const b = bucketOf(asOf, dueDate)
  if (targetBucket === 'notDue') return b.startsWith('due')
  if (targetBucket === 'd0_30' || targetBucket === 'overdue0_30') return b === 'overdue0_30'
  if (targetBucket === 'd31_60' || targetBucket === 'overdue31_60') return b === 'overdue31_60'
  if (targetBucket === 'd61_90' || targetBucket === 'overdue61_90') return b === 'overdue61_90'
  if (targetBucket === 'd90plus' || targetBucket === 'overdue90plus') return b === 'overdue90plus'
  return b === targetBucket
}

export async function computeDrill(
  filter: AppContextFilter,
  drill: DrillState,
  offset: number = 0,
): Promise<DrillResult> {
  const tree = await getCachedCoaTree()
  const periods = await getCachedPeriods()
  const { entities } = await getCachedEntities()
  const activePeriods = periods.filter((p) => filter.periodIds.includes(p.periodeId))

  const steps = drill.steps || []
  const lastStep = steps[steps.length - 1]
  const currentKind = lastStep?.kind

  // Helper maps
  const stepMap = new Map(steps.map((s) => [s.kind, s]))
  const folderStep = stepMap.get('folder')
  const accountStep = stepMap.get('account')
  const entityStep = stepMap.get('entity')
  const bucketStep = stepMap.get('bucket')
  const vendorStep = stepMap.get('vendor')
  const customerStep = stepMap.get('customer')
  const cardStep = stepMap.get('card')
  const dayStep = stepMap.get('day')

  // Case 1: AP / AR Card Settlement History (Leaf)
  if (cardStep) {
    const history = await cardSettlementHistory(cardStep.id)
    return {
      title: `Riwayat Pelunasan — ${cardStep.label}`,
      columns: [
        { id: 'txNumber', label: 'No. Dokumen', kind: 'code' },
        { id: 'txDate', label: 'Tanggal', kind: 'date' },
        { id: 'amount', label: 'Pelunasan (Rp)', kind: 'money' },
      ],
      rows: history.map((h) => ({
        id: h.cardId,
        txNumber: h.transactionNumber || h.cardId,
        txDate: h.txDate,
        amount: h.amount,
      })),
      nextKind: null,
      hasMore: false,
    }
  }

  // Case 2: AP Aging -> Invoices for a Vendor
  if (drill.metric === 'apAging' && vendorStep) {
    const asOfPlusOne = addDays(filter.asOf, 1)
    const rawAp = await apAgingPartA(asOfPlusOne, filter.locationIds)
    let vendorBills = rawAp.filter((a) => a.vendorId === vendorStep.id && D(a.balance).gt(0))
    if (bucketStep) {
      vendorBills = vendorBills.filter((b) =>
        matchesBucket(filter.asOf, (b.dueDate || b.txDate) as IsoDate, bucketStep.id),
      )
    }
    return {
      title: `Tagihan Vendor — ${vendorStep.label}`,
      columns: [
        { id: 'invoiceNumber', label: 'No. Tagihan', kind: 'code' },
        { id: 'txDate', label: 'Tanggal', kind: 'date' },
        { id: 'dueDate', label: 'Jatuh Tempo', kind: 'date' },
        { id: 'balance', label: 'Sisa Utang (Rp)', kind: 'money' },
      ],
      rows: vendorBills.map((b) => ({
        id: b.invoiceId,
        invoiceNumber: b.invoiceNumber || b.invoiceId,
        txDate: b.txDate,
        dueDate: b.dueDate || b.txDate,
        balance: b.balance,
      })),
      nextKind: 'card',
      hasMore: false,
    }
  }

  // Case 3: AR Aging -> Invoices for a Customer
  if (drill.metric === 'arAging' && customerStep) {
    const asOfPlusOne = addDays(filter.asOf, 1)
    const rawAr = await arAgingPartA(asOfPlusOne, filter.locationIds)
    let customerInvoices = rawAr.filter((a) => a.customerId === customerStep.id && D(a.balance).gt(0))
    if (bucketStep) {
      customerInvoices = customerInvoices.filter((b) =>
        matchesBucket(filter.asOf, (b.dueDate || b.txDate) as IsoDate, bucketStep.id),
      )
    }
    return {
      title: `Faktur Pelanggan — ${customerStep.label}`,
      columns: [
        { id: 'invoiceNumber', label: 'No. Faktur', kind: 'code' },
        { id: 'txDate', label: 'Tanggal', kind: 'date' },
        { id: 'dueDate', label: 'Jatuh Tempo', kind: 'date' },
        { id: 'balance', label: 'Sisa Piutang (Rp)', kind: 'money' },
      ],
      rows: customerInvoices.map((b) => ({
        id: b.invoiceId,
        invoiceNumber: b.invoiceNumber || b.invoiceId,
        txDate: b.txDate,
        dueDate: b.dueDate || b.txDate,
        balance: b.balance,
      })),
      nextKind: 'card',
      hasMore: false,
    }
  }

  // Case 4: Bucket -> Vendors (AP) or Customers (AR)
  if (drill.metric === 'apAging' && bucketStep && !vendorStep) {
    const asOfPlusOne = addDays(filter.asOf, 1)
    const rawAp = await apAgingPartA(asOfPlusOne, filter.locationIds)
    const matchingBills = rawAp.filter(
      (b) =>
        D(b.balance).gt(0) &&
        matchesBucket(filter.asOf, (b.dueDate || b.txDate) as IsoDate, bucketStep.id),
    )
    const vendorIds = Array.from(new Set(matchingBills.map((b) => b.vendorId).filter(Boolean)))
    const vendorList = await listVendors(vendorIds)
    const vendorMap = new Map(vendorList.map((v) => [v.vendorId, v]))

    const vendorTotals = new Map<Id, Decimal>()
    for (const b of matchingBills) {
      const curr = vendorTotals.get(b.vendorId) ?? D(0)
      vendorTotals.set(b.vendorId, curr.plus(D(b.balance)))
    }

    const rows: Array<Record<string, string | null>> = []
    for (const [vId, total] of vendorTotals.entries()) {
      const v = vendorMap.get(vId)
      rows.push({
        id: vId,
        code: v?.code || vId,
        name: v?.name || vId,
        amount: total.toFixed(2),
      })
    }

    return {
      title: `Vendor — Bucket ${bucketStep.label}`,
      columns: [
        { id: 'code', label: 'Kode', kind: 'code' },
        { id: 'name', label: 'Vendor', kind: 'text' },
        { id: 'amount', label: 'Total (Rp)', kind: 'money' },
      ],
      rows,
      nextKind: 'vendor',
      hasMore: false,
    }
  }

  if (drill.metric === 'arAging' && bucketStep && !customerStep) {
    const asOfPlusOne = addDays(filter.asOf, 1)
    const rawAr = await arAgingPartA(asOfPlusOne, filter.locationIds)
    const matchingBills = rawAr.filter(
      (b) =>
        D(b.balance).gt(0) &&
        matchesBucket(filter.asOf, (b.dueDate || b.txDate) as IsoDate, bucketStep.id),
    )
    const customerIds = Array.from(new Set(matchingBills.map((b) => b.customerId).filter(Boolean)))
    const customerList = await listCustomers(customerIds)
    const customerMap = new Map(customerList.map((c) => [c.customerId, c]))

    const customerTotals = new Map<Id, Decimal>()
    for (const b of matchingBills) {
      const curr = customerTotals.get(b.customerId) ?? D(0)
      customerTotals.set(b.customerId, curr.plus(D(b.balance)))
    }

    const rows: Array<Record<string, string | null>> = []
    for (const [cId, total] of customerTotals.entries()) {
      const c = customerMap.get(cId)
      rows.push({
        id: cId,
        code: c?.code || cId,
        name: c?.name || cId,
        amount: total.toFixed(2),
      })
    }

    return {
      title: `Pelanggan — Bucket ${bucketStep.label}`,
      columns: [
        { id: 'code', label: 'Kode', kind: 'code' },
        { id: 'name', label: 'Pelanggan', kind: 'text' },
        { id: 'amount', label: 'Total (Rp)', kind: 'money' },
      ],
      rows,
      nextKind: 'customer',
      hasMore: false,
    }
  }

  // Case 5: Payment Plan -> Day invoices
  if (drill.metric === 'paymentPlan' && dayStep) {
    const asOfPlusOne = addDays(filter.asOf, 1)
    const rawAp = await apAgingPartA(asOfPlusOne, filter.locationIds)
    const dayBills = rawAp.filter(
      (a) => (a.dueDate || a.txDate) === dayStep.id && D(a.balance).gt(0),
    )
    const vendorIds = Array.from(new Set(dayBills.map((b) => b.vendorId)))
    const vendorList = await listVendors(vendorIds)
    const vendorMap = new Map(vendorList.map((v) => [v.vendorId, v.name]))

    return {
      title: `Tagihan Jatuh Tempo — ${dayStep.label}`,
      columns: [
        { id: 'vendorName', label: 'Vendor', kind: 'text' },
        { id: 'invoiceNumber', label: 'No. Tagihan', kind: 'code' },
        { id: 'balance', label: 'Jumlah (Rp)', kind: 'money' },
      ],
      rows: dayBills.map((b) => ({
        id: b.invoiceId,
        vendorName: vendorMap.get(b.vendorId) || b.vendorId,
        invoiceNumber: b.invoiceNumber || b.invoiceId,
        balance: b.balance,
      })),
      nextKind: null,
      hasMore: false,
    }
  }

  // Determine if single entity is selected in global filter
  const hasSingleEntity =
    filter.segmentDetailIds !== 'all' && filter.segmentDetailIds.length === 1

  // Case 6: Journal level reached
  // Reached if:
  // 1) Explicit entity step is selected, OR
  // 2) Account step is selected AND (cashPosition metric OR single entity selected in global filter)
  if (
    currentKind === 'entity' ||
    (currentKind === 'account' && (drill.metric === 'cashPosition' || hasSingleEntity))
  ) {
    let targetCoaIds: Id[] = []
    if (accountStep) {
      targetCoaIds = [accountStep.id]
    } else if (folderStep) {
      targetCoaIds = postableDescendants(tree, folderStep.id)
    }

    let targetSegIds: Id[] | 'all' = filter.segmentDetailIds
    if (entityStep) {
      const ent = entities.find((e) => e.locationId === entityStep.id || e.code === entityStep.id)
      if (ent) {
        targetSegIds = ent.segmentDetailIds
      }
    }

    const jLines = await journalLines({
      periods: activePeriods,
      coaIds: targetCoaIds,
      segCol: filter.entitySegmentColumn,
      segIds: targetSegIds,
      limit: 200,
      offset,
    })

    return {
      title: `Jurnal Transaksi — ${lastStep?.label || 'Jurnal'}`,
      columns: [
        { id: 'journalNumber', label: 'No. Jurnal', kind: 'code' },
        { id: 'transDate', label: 'Tanggal', kind: 'date' },
        { id: 'journalTypeLabel', label: 'Tipe', kind: 'text' },
        { id: 'memo', label: 'Keterangan', kind: 'text' },
        { id: 'debet', label: 'Debet (Rp)', kind: 'money' },
        { id: 'credit', label: 'Kredit (Rp)', kind: 'money' },
      ],
      rows: jLines.map((j) => {
        const groupKey = getJournalGroupKey(j.journalType)
        const typeLabel = JOURNAL_GROUP_LABELS[groupKey]?.id || `Tipe ${j.journalType}`
        return {
          id: j.glId,
          journalNumber: j.journalNumber,
          transDate: j.transDate,
          journalTypeLabel: `${typeLabel} (${j.journalType})`,
          memo: j.memo,
          debet: j.debet,
          credit: j.credit,
        }
      }),
      nextKind: null,
      hasMore: jLines.length === 200,
    }
  }

  // Case 7: Account level -> Entity breakdown (for revenue, pnl, fixedCost, budget when entityStep not yet selected)
  if (currentKind === 'account') {
    const movements = await movementsByPeriods({
      periods: activePeriods,
      segCol: filter.entitySegmentColumn,
      segIds: filter.segmentDetailIds,
      coaIds: [accountStep!.id],
      byLocation: true,
    })

    const entMap = new Map<Id, Decimal>()
    for (const m of movements) {
      if (m.locationId) {
        const curr = entMap.get(m.locationId) ?? D(0)
        entMap.set(m.locationId, curr.plus(D(m.credit).minus(D(m.debet))))
      }
    }

    const rows: Array<Record<string, string | null>> = []
    for (const ent of entities) {
      const amt = entMap.get(ent.locationId)
      if (amt && !amt.isZero()) {
        rows.push({
          id: ent.locationId,
          code: ent.code,
          name: ent.name,
          amount: amt.toFixed(2),
        })
      }
    }

    return {
      title: `Entitas — ${accountStep ? accountStep.label : 'Entitas'}`,
      columns: [
        { id: 'code', label: 'Kode', kind: 'code' },
        { id: 'name', label: 'Entitas', kind: 'text' },
        { id: 'amount', label: 'Total (Rp)', kind: 'money' },
      ],
      rows,
      nextKind: 'entity',
      hasMore: false,
    }
  }

  // Case 8: Folder / Section / Subrow level -> Accounts in folder
  if (lastStep && (currentKind === 'folder' || currentKind === 'section' || currentKind === 'subrow')) {
    const folderId = folderStep?.id || lastStep.id
    const childCoaIds = postableDescendants(tree, folderId)

    const movements = await movementsByPeriods({
      periods: activePeriods,
      segCol: filter.entitySegmentColumn,
      segIds: filter.segmentDetailIds,
      coaIds: childCoaIds,
    })

    const movMap = new Map<Id, Decimal>()
    for (const m of movements) {
      const curr = movMap.get(m.coaId) ?? D(0)
      movMap.set(m.coaId, curr.plus(D(m.credit).minus(D(m.debet))))
    }

    const rows: Array<Record<string, string | null>> = []
    for (const cId of childCoaIds) {
      const node = tree.byId.get(cId)
      const amt = movMap.get(cId)
      if (amt && !amt.isZero() && node) {
        rows.push({
          id: node.coaId,
          code: node.code,
          name: node.name,
          amount: amt.toFixed(2),
        })
      }
    }

    return {
      title: `Akun — ${lastStep.label}`,
      columns: [
        { id: 'code', label: 'Kode Akun', kind: 'code' },
        { id: 'name', label: 'Nama Akun', kind: 'text' },
        { id: 'amount', label: 'Jumlah (Rp)', kind: 'money' },
      ],
      rows,
      nextKind: 'account',
      hasMore: false,
    }
  }

  // Default empty fallback
  return {
    title: 'Rincian Transaksi',
    columns: [],
    rows: [],
    nextKind: null,
    hasMore: false,
  }
}
