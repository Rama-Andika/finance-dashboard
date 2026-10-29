import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D } from '~/lib/finance/money'
import { addDays } from '~/lib/format/date'
import { type Id } from '~/lib/finance/types'
import { apOpenInvoices, arOpenInvoices, listCustomers, listVendors } from '~/server/repo/apar.repo'
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
    const statuses = isAp ? await statusMapFor(shown.map((a) => a.invoiceId)) : null
    return {
      titleKey: isAp ? 'drill.title.bills' : 'drill.title.invoices',
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
  const dayBills = raw.filter((a) => {
    if (!D(a.balance).gt(0)) return false
    const due = a.dueDate || a.txDate
    return isDayZero ? due <= today : due === dayStep.id // day 0 also carries the overdue bills
  })
  dayBills.sort((a, b) => (a.dueDate || a.txDate).localeCompare(b.dueDate || b.txDate) || a.invoiceId.localeCompare(b.invoiceId))
  const { page: shownBills, hasMore } = pageOf(dayBills, ctx.offset)
  const vendorMap = new Map((await listVendors(Array.from(new Set(shownBills.map((b) => b.vendorId))))).map((v) => [v.vendorId, v.name]))
  const statuses = await statusMapFor(shownBills.map((b) => b.invoiceId))
  return {
    titleKey: 'drill.title.dueBills',
    titleLabel: dayStep.label,
    columns: [col('vendor', 'text'), col('invoiceNumber', 'code'), col('dueDate', 'date'), col('balance', 'money'), col('status', 'status')],
    rows: shownBills.map((b) => ({
      id: b.invoiceId,
      vendor: vendorMap.get(b.vendorId) || b.vendorId,
      invoiceNumber: b.invoiceNumber || b.invoiceId,
      dueDate: b.dueDate || b.txDate,
      balance: b.balance,
      status: statuses.get(b.invoiceId) ?? 'notSubmitted',
    })),
    nextKind: 'card',
    hasMore,
  }
}

