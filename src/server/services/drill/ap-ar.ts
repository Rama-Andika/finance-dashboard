import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D, addTo } from '~/lib/core/money'
import { buildEntityCaptions } from '~/lib/finance/entity/entity-owner'
import { compareMoney } from '~/lib/table/query'
import { addDays, diffDays } from '~/lib/format/date'
import { type Id, type IsoDate } from '~/lib/core/types'
import {
  apOpenInvoices,
  arOpenInvoices,
  type ApOpenInvoiceRow,
  type ArOpenInvoiceRow,
} from '~/server/repo/ap-ar/aging.repo'
import { listCustomers, listVendors } from '~/server/repo/ap-ar/party.repo'
import { computePaymentPlan, type PaymentPlanOptions } from '~/server/services/ap-ar/payment-plan.service'
import { type DrillState, type DrillStep, type DrillStepKind } from '~/lib/filters/search-schema'
import {
  col,
  NAMED_TOTAL_COLUMNS,
  matchesBucket,
  statusMapFor,
  type DrillContext,
  type DrillResult,
  pageOf,
} from '~/server/services/drill/shared'

// ---------------------------------------------------------------------------
// AP / AR aging, payment plan
// ---------------------------------------------------------------------------

type OpenInvoice = ApOpenInvoiceRow | ArOpenInvoiceRow
type PartyNames = Map<Id, { code: string; name: string }>

/** What differs between the payables side and the receivables side of the aging drill-down. */
type AgingDrillSide = {
  /** The drill step that holds the chosen vendor or customer. */
  partyKind: 'vendor' | 'customer'
  /** i18n key of the list with the invoices of one party. */
  invoicesTitleKey: string
  /** i18n key of the list with the parties of one aging bucket. */
  partiesTitleKey: string
  /** Only bills have a plan status: the payment plan is about what the company pays. */
  hasPlanStatus: boolean
  loadInvoices: (asOfPlusOne: IsoDate, locationIds: Id[] | 'all') => Promise<readonly OpenInvoice[]>
  lookupParties: (ids: Id[]) => Promise<PartyNames>
}

const AGING_DRILL_SIDES: Record<'ap' | 'ar', AgingDrillSide> = {
  ap: {
    partyKind: 'vendor',
    invoicesTitleKey: 'drill.title.bills',
    partiesTitleKey: 'drill.title.vendors',
    hasPlanStatus: true,
    loadInvoices: apOpenInvoices,
    lookupParties: async (ids) => new Map((await listVendors(ids)).map((v) => [v.vendorId, v])),
  },
  ar: {
    partyKind: 'customer',
    invoicesTitleKey: 'drill.title.invoices',
    partiesTitleKey: 'drill.title.customers',
    hasPlanStatus: false,
    loadInvoices: arOpenInvoices,
    lookupParties: async (ids) => new Map((await listCustomers(ids)).map((c) => [c.customerId, c])),
  },
}

const partyIdOf = (invoice: OpenInvoice): Id => ('vendorId' in invoice ? invoice.vendorId : invoice.customerId)

export async function apArDrill(
  ctx: DrillContext,
  drill: DrillState,
  steps: Map<DrillStepKind, DrillStep>,
): Promise<DrillResult> {
  const side = AGING_DRILL_SIDES[drill.metric === 'apAging' ? 'ap' : 'ar']
  const asOf = ctx.filter.asOf
  const bucketStep = steps.get('bucket')
  const partyStep = steps.get(side.partyKind)
  // The cached invoice lists are shared: read them, never copy or modify them.
  const raw = await side.loadInvoices(addDays(asOf, 1), ctx.filter.locationIds)

  let items = raw.filter((a) => compareMoney(a.balance, '0') > 0)
  if (bucketStep) items = items.filter((a) => matchesBucket(asOf, a.dueDate || a.txDate, bucketStep.id))

  return partyStep
    ? partyInvoicesPage(ctx, side, items, partyStep)
    : partyTotalsPage(ctx, side, items, bucketStep?.label ?? '')
}

/** The open invoices of one vendor or customer, newest transaction first, one page. */
async function partyInvoicesPage(
  ctx: DrillContext,
  side: AgingDrillSide,
  items: readonly OpenInvoice[],
  partyStep: DrillStep,
): Promise<DrillResult> {
  const partyItems = items
    .filter((a) => partyIdOf(a) === partyStep.id)
    .sort((a, b) => b.txDate.localeCompare(a.txDate) || b.invoiceId.localeCompare(a.invoiceId))
  const { page: shown, hasMore } = pageOf(partyItems, ctx.offset)
  const captions = buildEntityCaptions(ctx.entities, ctx.filter.entityCount)
  // Only the shown page needs its plan statuses
  const statuses = side.hasPlanStatus ? await statusMapFor(shown.map((a) => a.invoiceId)) : null
  return {
    titleKey: side.invoicesTitleKey,
    showEntity: captions.show,
    titleLabel: partyStep.label,
    columns: [
      col('invoiceNumber', 'code'),
      col('txDate', 'date'),
      col('dueDate', 'date'),
      col('balance', 'money'),
      ...(side.hasPlanStatus ? [col('status', 'status')] : []),
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
  }
}

/** The vendors or customers of one aging bucket with their balance, largest first, one page. */
async function partyTotalsPage(
  ctx: DrillContext,
  side: AgingDrillSide,
  items: readonly OpenInvoice[],
  bucketLabel: string,
): Promise<DrillResult> {
  const totals = new Map<Id, Decimal>()
  for (const a of items) {
    const partyId = partyIdOf(a)
    addTo(totals, partyId, D(a.balance))
  }
  const ranked = Array.from(totals.entries()).sort(([, a], [, b]) => b.cmp(a))
  const { page: shownParties, hasMore } = pageOf(ranked, ctx.offset)
  // Names are looked up for the shown page only
  const names = await side.lookupParties(shownParties.map(([id]) => id).filter(Boolean))
  return {
    titleKey: side.partiesTitleKey,
    titleLabel: bucketLabel,
    columns: NAMED_TOTAL_COLUMNS,
    rows: shownParties.map(([id, total]) => {
      const party = names.get(id)
      return { id, code: party?.code || '', name: party?.name || id, amount: total.toFixed(2) }
    }),
    nextKind: side.partyKind,
    hasMore,
  }
}

/** The smallest plan horizon (7, 14 or 30 days) whose last day is `day` or later; the plan is memoized per horizon. */
function horizonReaching(today: IsoDate, day: IsoDate): PaymentPlanOptions['horizon'] {
  const dayNumber = diffDays(day, today) + 1 // today is day 1
  if (dayNumber <= 7) return '7'
  if (dayNumber <= 14) return '14'
  return '30'
}

/**
 * The bills (and the vendor credits that reduce them) of one day of the payment plan. The rows come from the same plan the
 * Payment Plan page shows, so the drill-down can never disagree with it: the credits are allocated in one place only.
 */
export async function paymentPlanDrill(ctx: DrillContext, dayStep: DrillStep): Promise<DrillResult> {
  // The plan always starts today (data-model §6.9), independent of the period preset.
  const today = ctx.filter.today
  const isDayZero = dayStep.id === today
  const plan = await computePaymentPlan(ctx.filter, { horizon: horizonReaching(today, dayStep.id), inflow: false })

  // Day 0 also carries the overdue bills. A credit row sits on the due date of the bill it reduces.
  const dayRows = plan.bills
    .filter((b) => (isDayZero ? b.dueDate <= today : b.dueDate === dayStep.id))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.invoiceId.localeCompare(b.invoiceId))
  const { page: shownRows, hasMore } = pageOf(dayRows, ctx.offset)

  const captions = buildEntityCaptions(ctx.entities, ctx.filter.entityCount)
  return {
    titleKey: 'drill.title.dueBills',
    showEntity: captions.show,
    titleLabel: dayStep.label,
    columns: [
      col('vendor', 'text'),
      col('invoiceNumber', 'code'),
      col('dueDate', 'date'),
      col('balance', 'money'),
      col('status', 'status'),
    ],
    rows: shownRows.map((b) => ({
      id: b.invoiceId,
      vendor: b.vendorName,
      invoiceNumber: b.invoiceNumber,
      dueDate: b.dueDate,
      balance: b.balance,
      status: b.status,
      ...(captions.show ? { entityName: b.entityName } : {}),
    })),
    nextKind: 'card',
    hasMore,
  }
}
