import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D } from '~/lib/core/money'
import { buildEntityCaptions } from '~/lib/finance/entity/entity-owner'
import { addDays } from '~/lib/format/date'
import { type Id, type IsoDate, type Money } from '~/lib/core/types'
import { applyCredits, creditPoolsFromItems } from '~/lib/finance/ap-ar/payment-plan-credits'
import { apOpenInvoices, arOpenInvoices } from '~/server/repo/ap-ar/aging.repo'
import { listCustomers, listVendors } from '~/server/repo/ap-ar/party.repo'
import { type DrillState, type DrillStep, type DrillStepKind } from '~/lib/filters/search-schema'
import { col, NAMED_TOTAL_COLUMNS, matchesBucket, statusMapFor, type DrillContext, type DrillResult, pageOf } from '~/server/services/drill/shared'

// ---------------------------------------------------------------------------
// AP / AR aging, payment plan
// ---------------------------------------------------------------------------

export async function apArDrill(ctx: DrillContext, drill: DrillState, steps: Map<DrillStepKind, DrillStep>) {
  const isAp = drill.metric === 'apAging'
  const asOf = ctx.filter.asOf
  const bucketStep = steps.get('bucket')
  const partyStep = steps.get(isAp ? 'vendor' : 'customer')
  // The cached invoice lists are shared: read them, never copy or modify them.
  const raw = isAp
    ? await apOpenInvoices(addDays(asOf, 1), ctx.filter.locationIds)
    : await arOpenInvoices(addDays(asOf, 1), ctx.filter.locationIds)
  const partyOf = (a: (typeof raw)[number]): Id => ('vendorId' in a ? a.vendorId : a.customerId)

  let items = raw.filter((a) => D(a.balance).gt(0))
  if (bucketStep) items = items.filter((a) => matchesBucket(asOf, a.dueDate || a.txDate, bucketStep.id))

  if (partyStep) {
    // Newest transaction date first; only the shown page needs its plan statuses
    const partyItems = items
      .filter((a) => partyOf(a) === partyStep.id)
      .sort((a, b) => b.txDate.localeCompare(a.txDate) || b.invoiceId.localeCompare(a.invoiceId))
    const { page: shown, hasMore } = pageOf(partyItems, ctx.offset)
    const captions = buildEntityCaptions(ctx.entities, ctx.filter.entityCount)
    const statuses = isAp ? await statusMapFor(shown.map((a) => a.invoiceId)) : null
    return {
      titleKey: isAp ? 'drill.title.bills' : 'drill.title.invoices',
      showEntity: captions.show,
      titleLabel: partyStep.label,
      columns: [
        col('invoiceNumber', 'code'),
        col('txDate', 'date'),
        col('dueDate', 'date'),
        col('balance', 'money'),
        ...(isAp ? [col('status', 'status')] : []),
      ],
      rows: shown.map((a) => ({
        id: a.invoiceId,
        invoiceNumber: a.invoiceNumber || a.invoiceId,
        txDate: a.txDate,
        dueDate: a.dueDate || a.txDate,
        balance: a.balance,
        ...(statuses ? { status: statuses.get(a.invoiceId) ?? 'notSubmitted' } : {}),
        ...captions.fieldsOfLocation(a.locationId),
      })),
      nextKind: 'card',
      hasMore,
    } satisfies DrillResult
  }

  const totals = new Map<Id, Decimal>()
  for (const a of items) totals.set(partyOf(a), (totals.get(partyOf(a)) ?? D(0)).plus(D(a.balance)))
  // Largest balance first; names are looked up for the shown page only
  const ranked = Array.from(totals.entries()).sort(([, a], [, b]) => b.cmp(a))
  const { page: shownParties, hasMore: moreParties } = pageOf(ranked, ctx.offset)
  const ids = shownParties.map(([id]) => id).filter(Boolean)
  const names = isAp
    ? new Map((await listVendors(ids)).map((v) => [v.vendorId, v]))
    : new Map((await listCustomers(ids)).map((c) => [c.customerId, c]))
  return {
    titleKey: isAp ? 'drill.title.vendors' : 'drill.title.customers',
    titleLabel: bucketStep?.label ?? '',
    columns: NAMED_TOTAL_COLUMNS,
    rows: shownParties.map(([id, total]) => {
      const party = names.get(id)
      return { id, code: party?.code || '', name: party?.name || id, amount: total.toFixed(2) }
    }),
    nextKind: isAp ? 'vendor' : 'customer',
    hasMore: moreParties,
  } satisfies DrillResult
}

export async function paymentPlanDrill(ctx: DrillContext, dayStep: DrillStep): Promise<DrillResult> {
  // The plan always starts today (data-model §6.9), independent of the period preset.
  const today = ctx.filter.today
  const raw = await apOpenInvoices(addDays(today, 1), ctx.filter.locationIds)
  const isDayZero = dayStep.id === today
  const maxDue = isDayZero ? today : dayStep.id

  // Credits reduce bills due up to this day earliest due date first (decisions D53).
  const creditPools = creditPoolsFromItems(
    raw.map((a) => ({ partyId: a.vendorId, locationId: a.locationId, balance: a.balance })),
  )
  const creditableBills = raw
    .filter((a) => D(a.balance).gt(0) && (a.dueDate || a.txDate) <= maxDue)
    .map((a) => ({
      invoiceId: a.invoiceId,
      partyId: a.vendorId,
      locationId: a.locationId,
      dueDate: (a.dueDate || a.txDate).slice(0, 10),
      balance: a.balance,
    }))
  const { reductions } = applyCredits(creditableBills, creditPools)
  const dayReductions = reductions.filter((r) => (isDayZero ? r.dueDate <= today : r.dueDate === dayStep.id))

  const dayBills = raw.filter((a) => {
    if (!D(a.balance).gt(0)) return false
    const due = a.dueDate || a.txDate
    return isDayZero ? due <= today : due === dayStep.id // day 0 also carries the overdue bills
  })

  type CombinedBillRow = {
    id: Id
    vendorId: Id
    invoiceNumber: string
    dueDate: IsoDate
    balance: Money
    locationId: Id
    reducedInvoiceId?: Id
  }

  const combinedRows: CombinedBillRow[] = [
    ...dayBills.map((b) => ({
      id: b.invoiceId,
      vendorId: b.vendorId,
      invoiceNumber: b.invoiceNumber || b.invoiceId,
      dueDate: (b.dueDate || b.txDate).slice(0, 10),
      balance: b.balance,
      locationId: b.locationId,
    })),
    ...dayReductions.map((r) => ({
      id: `credit:${r.invoiceId}`,
      vendorId: r.partyId,
      invoiceNumber: '',
      dueDate: r.dueDate,
      balance: D(r.amount).negated().toFixed(2),
      locationId: r.locationId,
      reducedInvoiceId: r.invoiceId,
    })),
  ]

  combinedRows.sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id))
  const { page: shownRows, hasMore } = pageOf(combinedRows, ctx.offset)

  const statusInvoiceIds = Array.from(new Set(shownRows.map((r) => r.reducedInvoiceId ?? r.id)))
  const [vendors, statuses] = await Promise.all([
    listVendors(Array.from(new Set(shownRows.map((b) => b.vendorId)))),
    statusMapFor(statusInvoiceIds),
  ])
  const vendorMap = new Map(vendors.map((v) => [v.vendorId, v.name]))
  const captions = buildEntityCaptions(ctx.entities, ctx.filter.entityCount)
  return {
    titleKey: 'drill.title.dueBills',
    showEntity: captions.show,
    titleLabel: dayStep.label,
    columns: [col('vendor', 'text'), col('invoiceNumber', 'code'), col('dueDate', 'date'), col('balance', 'money'), col('status', 'status')],
    rows: shownRows.map((b) => {
      const invoiceForStatus = b.reducedInvoiceId ?? b.id
      return {
        id: b.id,
        vendor: vendorMap.get(b.vendorId) || b.vendorId,
        invoiceNumber: b.invoiceNumber,
        dueDate: b.dueDate,
        balance: b.balance,
        status: statuses.get(invoiceForStatus) ?? 'notSubmitted',
        ...captions.fieldsOfLocation(b.locationId),
      }
    }),
    nextKind: 'card',
    hasMore,
  }
}
