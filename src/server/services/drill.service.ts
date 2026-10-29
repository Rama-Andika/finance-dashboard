import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D } from '~/lib/finance/money'
import { addDays, diffDays } from '~/lib/format/date'
import type { Entity, Id, IsoDate, Period } from '~/lib/finance/types'
import {
  type AppContextFilter,
  getCachedCoaTree,
  getCachedEntities,
  getCachedPeriods,
} from '~/server/context'
import { env } from '~/server/env'
import { journalHeaders, journalLines, movementsByPeriods } from '~/server/repo/gl.repo'
import {
  apAgingPartA,
  arAgingPartA,
  cardSettlementHistory,
  expensePaidAllocated,
  expensePaidUnallocated,
  listCustomers,
  listPlanStatuses,
  listVendors,
} from '~/server/repo/apar.repo'
import { unsettledByChannel, unsettledTransactions } from '~/server/repo/bank-payment.repo'
import { postableDescendants, type CoaTree } from '~/lib/finance/coa-tree'
import { signedAmount } from '~/lib/finance/sign'
import { getJournalGroupKey } from '~/lib/finance/journal-type'
import { bucketOf, planStatus } from '~/lib/finance/aging'
import { findOciCoaIds } from '~/lib/finance/pnl'
import { resolveBaskets } from '~/lib/finance/basket-resolver'
import { loadAccountMapping } from '~/server/services/mapping.helper'
import { balancesAt } from '~/server/services/balance.service'
import { loadClassifiedPortions, type ClassifiedCashPortion } from '~/server/services/cash-flow.service'

import type { DrillState, DrillStep, DrillStepKind } from '~/lib/filters/search-schema'
export type { DrillState, DrillStep, DrillStepKind }

export type DrillColumnKind = 'text' | 'code' | 'money' | 'date' | 'status' | 'number'

/** `labelKey` is an i18n key (drill.col.*); the client translates it. */
export type DrillColumn = {
  id: string
  labelKey: string
  kind: DrillColumnKind
}

export type DrillResult = {
  /** i18n key (drill.title.*), interpolated with `titleLabel`. */
  titleKey: string
  titleLabel: string
  columns: DrillColumn[]
  rows: Array<Record<string, string | null>>
  nextKind: DrillStepKind | null
  hasMore: boolean
}

const PAGE_SIZE = 200
const AP_BILL_ITEM_TYPES = new Set([0, 1, 2, 4, 5, 6, 12]) // data-model §6.5(a), not type 3

const col = (id: string, kind: DrillColumnKind, labelKey = `drill.col.${id}`): DrillColumn => ({
  id,
  labelKey,
  kind,
})

const ACCOUNT_COLUMNS = [col('code', 'code'), col('name', 'text'), col('amount', 'money')]
const NAMED_TOTAL_COLUMNS = [col('code', 'code'), col('name', 'text'), col('amount', 'money')]
const JOURNAL_COLUMNS = [
  col('journalNumber', 'code'),
  col('transDate', 'date'),
  col('journalTypeKey', 'text'),
  col('memo', 'text'),
  col('debet', 'money'),
  col('credit', 'money'),
]
const PORTION_COLUMNS = [col('docNumber', 'code'), col('transDate', 'date'), col('memo', 'text'), col('amount', 'money')]

type DrillContext = {
  filter: AppContextFilter
  tree: CoaTree
  periods: Period[]
  activePeriods: Period[]
  entities: Entity[]
  offset: number
}

function empty(titleKey: string, titleLabel: string): DrillResult {
  return { titleKey, titleLabel, columns: [], rows: [], nextKind: null, hasMore: false }
}

/** Amount signed by the account group's natural side (G17), not raw credit − debet. */
function signedFor(tree: CoaTree, coaId: Id, debet: string, credit: string): Decimal {
  const node = tree.byId.get(coaId)
  if (!node) return D(credit).minus(D(debet))
  return D(signedAmount(node.accountGroup, debet, credit))
}

function accountIdsOf(tree: CoaTree, coaId: Id): Id[] {
  const node = tree.byId.get(coaId)
  if (!node) return []
  return node.status === 'POSTABLE' ? [coaId] : postableDescendants(tree, coaId)
}

/** Segment ids of the selected entity step, or the global filter's. */
function segIdsFor(ctx: DrillContext, entityStep?: DrillStep): Id[] | 'all' {
  if (!entityStep) return ctx.filter.segmentDetailIds
  const ent = ctx.entities.find((e) => e.locationId === entityStep.id || e.code === entityStep.id)
  return ent ? ent.segmentDetailIds : []
}

function hasSingleEntity(ctx: DrillContext): boolean {
  return ctx.filter.locationIds !== 'all' && ctx.filter.locationIds.length === 1
}

/** Accounts with their period movement, signed per account group. */
async function accountRows(ctx: DrillContext, coaIds: Id[], label: string): Promise<DrillResult> {
  const movements = await movementsByPeriods({
    periods: ctx.activePeriods,
    segCol: ctx.filter.entitySegmentColumn,
    segIds: ctx.filter.segmentDetailIds,
    coaIds,
  })
  const byCoa = new Map<Id, Decimal>()
  for (const m of movements) {
    byCoa.set(m.coaId, (byCoa.get(m.coaId) ?? D(0)).plus(signedFor(ctx.tree, m.coaId, m.debet, m.credit)))
  }
  const rows: Array<Record<string, string | null>> = []
  for (const id of coaIds) {
    const amt = byCoa.get(id)
    const node = ctx.tree.byId.get(id)
    if (amt && !amt.isZero() && node) {
      rows.push({ id, code: node.code, name: node.name, amount: amt.toFixed(2) })
    }
  }
  rows.sort((a, b) => (a.code ?? '').localeCompare(b.code ?? ''))
  return {
    titleKey: 'drill.title.accounts',
    titleLabel: label,
    columns: ACCOUNT_COLUMNS,
    rows,
    nextKind: 'account',
    hasMore: false,
  }
}

/** One account's period movement split per entity. */
async function entityRows(ctx: DrillContext, coaIds: Id[], label: string): Promise<DrillResult> {
  const movements = await movementsByPeriods({
    periods: ctx.activePeriods,
    segCol: ctx.filter.entitySegmentColumn,
    segIds: ctx.filter.segmentDetailIds,
    coaIds,
    byLocation: true,
  })
  const byLoc = new Map<Id, Decimal>()
  for (const m of movements) {
    const key = m.locationId ?? ''
    byLoc.set(key, (byLoc.get(key) ?? D(0)).plus(signedFor(ctx.tree, m.coaId, m.debet, m.credit)))
  }
  const rows: Array<Record<string, string | null>> = []
  for (const ent of ctx.entities) {
    const amt = byLoc.get(ent.locationId)
    if (amt && !amt.isZero()) {
      rows.push({ id: ent.locationId, code: ent.code, name: ent.name, amount: amt.toFixed(2) })
    }
  }
  return {
    titleKey: 'drill.title.entities',
    titleLabel: label,
    columns: NAMED_TOTAL_COLUMNS,
    rows,
    nextKind: 'entity',
    hasMore: false,
  }
}

async function journalRows(
  ctx: DrillContext,
  coaIds: Id[],
  segIds: Id[] | 'all',
  label: string,
  dateRange?: { from: IsoDate; to: IsoDate },
): Promise<DrillResult> {
  const lines = await journalLines({
    periods: dateRange ? undefined : ctx.activePeriods,
    startDate: dateRange?.from,
    endDate: dateRange?.to,
    coaIds,
    segCol: ctx.filter.entitySegmentColumn,
    segIds,
    limit: PAGE_SIZE,
    offset: ctx.offset,
  })
  return {
    titleKey: 'drill.title.journals',
    titleLabel: label,
    columns: JOURNAL_COLUMNS,
    rows: lines.map((j) => ({
      id: `${j.glId}-${j.coaId}`,
      journalNumber: j.journalNumber,
      transDate: j.transDate,
      journalTypeKey: getJournalGroupKey(j.journalType),
      journalType: String(j.journalType),
      memo: j.memo,
      debet: j.debet,
      credit: j.credit,
    })),
    nextKind: null,
    hasMore: lines.length === PAGE_SIZE,
  }
}

/** Journals behind a set of cash portions (Cash Flow / Expense Paid leaves). */
async function portionJournalRows(
  ctx: DrillContext,
  portions: ClassifiedCashPortion[],
  label: string,
  sign: 1 | -1,
): Promise<DrillResult> {
  const byGl = new Map<Id, Decimal>()
  for (const p of portions) byGl.set(p.glId, (byGl.get(p.glId) ?? D(0)).plus(D(p.portion).times(sign)))
  const glIds = Array.from(byGl.keys())
  const page = glIds.slice(ctx.offset, ctx.offset + PAGE_SIZE)
  const tables = Array.from(new Set(ctx.activePeriods.map((p) => p.tableName)))
  const headers = await journalHeaders({ tables: tables.length > 0 ? tables : ['gl'], glIds: page })
  const headerMap = new Map(headers.map((h) => [h.glId, h]))
  const rows = page.map((glId) => {
    const h = headerMap.get(glId)
    return {
      id: glId,
      docNumber: h?.journalNumber || glId,
      transDate: h?.transDate ?? null,
      memo: h?.memo ?? '',
      amount: (byGl.get(glId) ?? D(0)).toFixed(2),
    }
  })
  rows.sort((a, b) => (b.transDate ?? '').localeCompare(a.transDate ?? ''))
  return {
    titleKey: 'drill.title.journals',
    titleLabel: label,
    columns: PORTION_COLUMNS,
    rows,
    nextKind: null,
    hasMore: ctx.offset + PAGE_SIZE < glIds.length,
  }
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

async function statusMapFor(invoiceIds: Id[]): Promise<Map<Id, string>> {
  const statusRows = await listPlanStatuses(invoiceIds)
  const grouped = new Map<Id, string[]>()
  for (const r of statusRows) {
    const list = grouped.get(r.invoiceId) ?? []
    list.push(r.status)
    grouped.set(r.invoiceId, list)
  }
  const result = new Map<Id, string>()
  for (const id of invoiceIds) result.set(id, planStatus(grouped.get(id) ?? []))
  return result
}

// ---------------------------------------------------------------------------
// AP / AR aging, payment plan
// ---------------------------------------------------------------------------

async function apArDrill(ctx: DrillContext, drill: DrillState, steps: Map<DrillStepKind, DrillStep>) {
  const isAp = drill.metric === 'apAging'
  const asOf = ctx.filter.asOf
  const bucketStep = steps.get('bucket')
  const partyStep = steps.get(isAp ? 'vendor' : 'customer')
  const raw = isAp
    ? (await apAgingPartA(addDays(asOf, 1), ctx.filter.locationIds)).map((a) => ({ ...a, partyId: a.vendorId }))
    : (await arAgingPartA(addDays(asOf, 1), ctx.filter.locationIds)).map((a) => ({ ...a, partyId: a.customerId }))

  let items = raw.filter((a) => D(a.balance).gt(0))
  if (bucketStep) items = items.filter((a) => matchesBucket(asOf, a.dueDate || a.txDate, bucketStep.id))

  if (partyStep) {
    const partyItems = items.filter((a) => a.partyId === partyStep.id)
    const statuses = isAp ? await statusMapFor(partyItems.map((a) => a.invoiceId)) : null
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
      rows: partyItems.map((a) => ({
        id: a.invoiceId,
        invoiceNumber: a.invoiceNumber || a.invoiceId,
        txDate: a.txDate,
        dueDate: a.dueDate || a.txDate,
        balance: a.balance,
        ...(statuses ? { status: statuses.get(a.invoiceId) ?? 'notSubmitted' } : {}),
      })),
      nextKind: 'card',
      hasMore: false,
    } satisfies DrillResult
  }

  const totals = new Map<Id, Decimal>()
  for (const a of items) totals.set(a.partyId, (totals.get(a.partyId) ?? D(0)).plus(D(a.balance)))
  const ids = Array.from(totals.keys()).filter(Boolean)
  const names = isAp
    ? new Map((await listVendors(ids)).map((v) => [v.vendorId, v]))
    : new Map((await listCustomers(ids)).map((c) => [c.customerId, c]))
  return {
    titleKey: isAp ? 'drill.title.vendors' : 'drill.title.customers',
    titleLabel: bucketStep?.label ?? '',
    columns: NAMED_TOTAL_COLUMNS,
    rows: Array.from(totals.entries()).map(([id, total]) => {
      const party = names.get(id)
      return { id, code: party?.code || '', name: party?.name || id, amount: total.toFixed(2) }
    }),
    nextKind: isAp ? 'vendor' : 'customer',
    hasMore: false,
  } satisfies DrillResult
}

async function paymentPlanDrill(ctx: DrillContext, dayStep: DrillStep): Promise<DrillResult> {
  // The plan always starts today (data-model §6.9), independent of the period preset.
  const today = ctx.filter.today
  const raw = await apAgingPartA(addDays(today, 1), ctx.filter.locationIds)
  const isDayZero = dayStep.id === today
  const dayBills = raw.filter((a) => {
    if (!D(a.balance).gt(0)) return false
    const due = a.dueDate || a.txDate
    return isDayZero ? due <= today : due === dayStep.id // day 0 also carries the overdue bills
  })
  const vendorMap = new Map((await listVendors(Array.from(new Set(dayBills.map((b) => b.vendorId))))).map((v) => [v.vendorId, v.name]))
  const statuses = await statusMapFor(dayBills.map((b) => b.invoiceId))
  return {
    titleKey: 'drill.title.dueBills',
    titleLabel: dayStep.label,
    columns: [col('vendor', 'text'), col('invoiceNumber', 'code'), col('dueDate', 'date'), col('balance', 'money'), col('status', 'status')],
    rows: dayBills.map((b) => ({
      id: b.invoiceId,
      vendor: vendorMap.get(b.vendorId) || b.vendorId,
      invoiceNumber: b.invoiceNumber || b.invoiceId,
      dueDate: b.dueDate || b.txDate,
      balance: b.balance,
      status: statuses.get(b.invoiceId) ?? 'notSubmitted',
    })),
    nextKind: 'card',
    hasMore: false,
  }
}

// ---------------------------------------------------------------------------
// Cash position & funds in transit
// ---------------------------------------------------------------------------

async function cashPositionDrill(ctx: DrillContext, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
  const sectionStep = steps.get('section')
  const folderStep = steps.get('folder')
  const accountStep = steps.get('account')
  const resolved = resolveBaskets(await loadAccountMapping(ctx.tree), ctx.tree)
  const sectionIds: Record<string, Id[]> = {
    cash: resolved.cash,
    bank: resolved.bank,
    deposit: resolved.deposit,
    inTransit: resolved.inTransit,
  }

  if (accountStep) {
    // Journals of the account in the selected range (by transaction date)
    return journalRows(ctx, [accountStep.id], ctx.filter.segmentDetailIds, accountStep.label, {
      from: ctx.filter.d1,
      to: ctx.filter.asOf,
    })
  }

  const basketIds = sectionStep
    ? (sectionIds[sectionStep.id] ?? [])
    : Array.from(new Set([...resolved.cash, ...resolved.bank]))
  const scope = folderStep ? new Set(accountIdsOf(ctx.tree, folderStep.id)) : null
  const coaIds = scope ? basketIds.filter((id) => scope.has(id)) : basketIds
  const { byCoa } = await balancesAt({ asOf: ctx.filter.asOf, coaIds, filter: ctx.filter })

  const rows = coaIds
    .map((id) => {
      const node = ctx.tree.byId.get(id)
      return { id, code: node?.code ?? '', name: node?.name ?? id, amount: byCoa.get(id) ?? '0.00' }
    })
    .filter((r) => !D(r.amount).isZero())
    .sort((a, b) => a.code.localeCompare(b.code))

  return {
    titleKey: 'drill.title.balances',
    titleLabel: (folderStep ?? sectionStep)?.label ?? '',
    columns: [col('code', 'code'), col('name', 'text'), col('amount', 'money', 'drill.col.balance')],
    rows,
    nextKind: 'account',
    hasMore: false,
  }
}

async function inTransitDrill(ctx: DrillContext, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
  const channelStep = steps.get('channel')
  if (!channelStep) return empty('drill.title.transactions', '')
  const entityStep = steps.get('entity')
  const dateStep = steps.get('date')
  const segIds = segIdsFor(ctx, entityStep)

  if (dateStep) {
    const tx = await unsettledTransactions({
      coaId: channelStep.id,
      asOf: ctx.filter.asOf,
      segCol: ctx.filter.entitySegmentColumn,
      segIds,
      txDate: dateStep.id,
      limit: PAGE_SIZE,
      offset: ctx.offset,
    })
    return {
      titleKey: 'drill.title.transactions',
      titleLabel: dateStep.label,
      columns: [col('docNumber', 'code'), col('txDate', 'date'), col('amount', 'money')],
      rows: tx.map((t) => ({ id: t.id, docNumber: t.number || t.id, txDate: t.txDate, amount: t.amount })),
      nextKind: null,
      hasMore: tx.length === PAGE_SIZE,
    }
  }

  const unsettled = await unsettledByChannel(ctx.filter.asOf, [channelStep.id], segIds, ctx.filter.entitySegmentColumn)

  if (entityStep) {
    const byDate = new Map<IsoDate, { n: number; amount: Decimal }>()
    for (const u of unsettled) {
      const cur = byDate.get(u.txDate) ?? { n: 0, amount: D(0) }
      byDate.set(u.txDate, { n: cur.n + u.n, amount: cur.amount.plus(D(u.amount)) })
    }
    return {
      titleKey: 'drill.title.dates',
      titleLabel: entityStep.label,
      columns: [col('txDate', 'date'), col('count', 'number'), col('ageDays', 'number'), col('amount', 'money')],
      rows: Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({
          id: date,
          label: date,
          txDate: date,
          count: String(v.n),
          ageDays: String(diffDays(ctx.filter.today, date)),
          amount: v.amount.toFixed(2),
        })),
      nextKind: 'date',
      hasMore: false,
    }
  }

  const segToEntity = new Map<Id, Entity>()
  for (const e of ctx.entities) for (const s of e.segmentDetailIds) segToEntity.set(s, e)
  const byEntity = new Map<Id, { entity: Entity | null; amount: Decimal; n: number }>()
  for (const u of unsettled) {
    const ent = segToEntity.get(u.segmentDetailId) ?? null
    const key = ent?.locationId ?? ''
    const cur = byEntity.get(key) ?? { entity: ent, amount: D(0), n: 0 }
    byEntity.set(key, { entity: ent, amount: cur.amount.plus(D(u.amount)), n: cur.n + u.n })
  }
  return {
    titleKey: 'drill.title.entities',
    titleLabel: channelStep.label,
    columns: [col('code', 'code'), col('name', 'text'), col('count', 'number'), col('amount', 'money')],
    rows: Array.from(byEntity.entries()).map(([id, v]) => ({
      id,
      code: v.entity?.code ?? '',
      name: v.entity?.name ?? '—',
      count: String(v.n),
      amount: v.amount.toFixed(2),
    })),
    nextKind: 'entity',
    hasMore: false,
  }
}

// ---------------------------------------------------------------------------
// Cash flow & expense paid (built on classified cash portions)
// ---------------------------------------------------------------------------

async function cashFlowDrill(ctx: DrillContext, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
  const sectionStep = steps.get('section')
  const subrowStep = steps.get('subrow')
  const accountStep = steps.get('account')
  if (!sectionStep) return empty('drill.title.subrows', '')

  const { portions } = await loadClassifiedPortions(ctx.filter)
  let scoped = portions.filter((p) => p.drawer === sectionStep.id)

  if (!subrowStep) {
    const bySub = new Map<string, Decimal>()
    for (const p of scoped) bySub.set(p.subGroup, (bySub.get(p.subGroup) ?? D(0)).plus(D(p.portion)))
    return {
      titleKey: 'drill.title.subrows',
      titleLabel: sectionStep.label,
      columns: [col('name', 'text'), col('amount', 'money')],
      rows: Array.from(bySub.entries()).map(([name, amt]) => ({ id: name, name, amount: amt.toFixed(2) })),
      nextKind: 'subrow',
      hasMore: false,
    }
  }

  scoped = scoped.filter((p) => p.subGroup === subrowStep.id)

  if (!accountStep) {
    const byCoa = new Map<Id, Decimal>()
    for (const p of scoped) byCoa.set(p.counterCoaId, (byCoa.get(p.counterCoaId) ?? D(0)).plus(D(p.portion)))
    return {
      titleKey: 'drill.title.counterAccounts',
      titleLabel: subrowStep.label,
      columns: ACCOUNT_COLUMNS,
      rows: Array.from(byCoa.entries()).map(([id, amt]) => {
        const node = ctx.tree.byId.get(id)
        return { id, code: node?.code ?? '', name: node?.name ?? id, amount: amt.toFixed(2) }
      }),
      nextKind: 'account',
      hasMore: false,
    }
  }

  return portionJournalRows(ctx, scoped.filter((p) => p.counterCoaId === accountStep.id), accountStep.label, 1)
}

async function expensePaidDrill(ctx: DrillContext, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
  const sectionStep = steps.get('section')
  const folderStep = steps.get('folder')
  const vendorStep = steps.get('vendor')
  const accountStep = steps.get('account')
  const d2PlusOne = addDays(ctx.filter.asOf, 1)

  // (a) AP bill payments and unallocated payments: category → vendor → payment cards
  if (sectionStep && (sectionStep.id === 'apBills' || sectionStep.id === 'unallocated')) {
    type Card = { cardId: Id; cardNumber: string; txDate: IsoDate; vendorId: Id; amount: Decimal }
    const cards = new Map<Id, Card>()
    if (sectionStep.id === 'apBills') {
      for (const r of await expensePaidAllocated(ctx.filter.d1, d2PlusOne, ctx.filter.locationIds)) {
        if (!AP_BILL_ITEM_TYPES.has(r.itemType)) continue
        const cur = cards.get(r.cardId) ?? { ...r, amount: D(0) }
        cur.amount = cur.amount.plus(D(r.detailSum).negated())
        cards.set(r.cardId, cur)
      }
    } else {
      for (const r of await expensePaidUnallocated(ctx.filter.d1, d2PlusOne, ctx.filter.locationIds)) {
        cards.set(r.cardId, { ...r, amount: D(r.signedAmount).negated() })
      }
    }

    if (vendorStep) {
      return {
        titleKey: 'drill.title.payments',
        titleLabel: vendorStep.label,
        columns: [col('docNumber', 'code'), col('txDate', 'date'), col('amount', 'money')],
        rows: Array.from(cards.values())
          .filter((c) => c.vendorId === vendorStep.id)
          .sort((a, b) => b.txDate.localeCompare(a.txDate))
          .map((c) => ({ id: c.cardId, docNumber: c.cardNumber || c.cardId, txDate: c.txDate, amount: c.amount.toFixed(2) })),
        nextKind: null,
        hasMore: false,
      }
    }

    const byVendor = new Map<Id, Decimal>()
    for (const c of cards.values()) byVendor.set(c.vendorId, (byVendor.get(c.vendorId) ?? D(0)).plus(c.amount))
    const vendors = new Map((await listVendors(Array.from(byVendor.keys()).filter(Boolean))).map((v) => [v.vendorId, v]))
    return {
      titleKey: 'drill.title.vendors',
      titleLabel: sectionStep.label,
      columns: NAMED_TOTAL_COLUMNS,
      rows: Array.from(byVendor.entries()).map(([id, amt]) => ({
        id,
        code: vendors.get(id)?.code ?? '',
        name: vendors.get(id)?.name || id,
        amount: amt.toFixed(2),
      })),
      nextKind: 'vendor',
      hasMore: false,
    }
  }

  // (b) Direct payments: expense folder → account → journals (cash = cash ∪ bank, §6.5 b)
  const scopeStep = folderStep ?? sectionStep
  if (!scopeStep) return empty('drill.title.accounts', '')
  const resolved = resolveBaskets(await loadAccountMapping(ctx.tree), ctx.tree)
  const { portions } = await loadClassifiedPortions(ctx.filter, {
    cashEquivIds: Array.from(new Set([...resolved.cash, ...resolved.bank])),
  })
  const inScope = new Set(accountIdsOf(ctx.tree, scopeStep.id))
  const paid = portions.filter((p) => {
    const group = ctx.tree.byId.get(p.counterCoaId)?.accountGroup
    return inScope.has(p.counterCoaId) && D(p.portion).lt(0) && (group === 'Cost Of Sales' || group === 'Expense')
  })

  if (accountStep) {
    return portionJournalRows(ctx, paid.filter((p) => p.counterCoaId === accountStep.id), accountStep.label, -1)
  }

  const byCoa = new Map<Id, Decimal>()
  for (const p of paid) byCoa.set(p.counterCoaId, (byCoa.get(p.counterCoaId) ?? D(0)).plus(D(p.portion).negated()))
  return {
    titleKey: 'drill.title.accounts',
    titleLabel: scopeStep.label,
    columns: ACCOUNT_COLUMNS,
    rows: Array.from(byCoa.entries()).map(([id, amt]) => {
      const node = ctx.tree.byId.get(id)
      return { id, code: node?.code ?? '', name: node?.name ?? id, amount: amt.toFixed(2) }
    }),
    nextKind: 'account',
    hasMore: false,
  }
}

// ---------------------------------------------------------------------------
// GL-based metrics: revenue, P&L, fixed cost, budget (and generic folders)
// ---------------------------------------------------------------------------

const PNL_LINE_GROUPS: Record<string, string> = {
  revenue: 'Revenue',
  cogs: 'Cost Of Sales',
  opex: 'Expense',
  otherRevenue: 'Other Revenue',
  otherExpense: 'Other Expense',
}

/** Accounts behind a section of the P&L or Fixed Cost page. */
async function sectionAccountIds(ctx: DrillContext, metric: string, sectionId: string): Promise<Id[]> {
  const postable = Array.from(ctx.tree.byId.values()).filter((n) => n.status === 'POSTABLE')
  if (metric === 'pnl') {
    const oci = findOciCoaIds(ctx.tree, env.ociRootCodes)
    if (sectionId === 'oci') return Array.from(oci)
    const group = PNL_LINE_GROUPS[sectionId]
    if (!group) return []
    // OCI accounts are excluded from every other line (K10)
    return postable.filter((n) => n.accountGroup === group && !oci.has(n.coaId)).map((n) => n.coaId)
  }
  if (metric === 'fixedCost') {
    const resolved = resolveBaskets(await loadAccountMapping(ctx.tree), ctx.tree)
    const fixed = new Set(resolved.fixedCost)
    if (sectionId === 'fixed') return resolved.fixedCost
    if (sectionId === 'variable') return postable.filter((n) => n.accountGroup === 'Expense' && !fixed.has(n.coaId)).map((n) => n.coaId)
  }
  return accountIdsOf(ctx.tree, sectionId)
}

async function glMetricDrill(ctx: DrillContext, drill: DrillState, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
  const sectionStep = steps.get('section')
  const folderStep = steps.get('folder')
  const accountStep = steps.get('account')
  const entityStep = steps.get('entity')

  if (accountStep) {
    const node = ctx.tree.byId.get(accountStep.id)
    // A HEADER clicked as "account" (budget rows) behaves like a folder.
    if (node && node.status === 'HEADER' && !entityStep) {
      return accountRows(ctx, accountIdsOf(ctx.tree, accountStep.id), accountStep.label)
    }
    const coaIds = node && node.status === 'HEADER' ? accountIdsOf(ctx.tree, accountStep.id) : [accountStep.id]
    if (entityStep || hasSingleEntity(ctx)) {
      return journalRows(ctx, coaIds, segIdsFor(ctx, entityStep), (entityStep ?? accountStep).label)
    }
    return entityRows(ctx, coaIds, accountStep.label)
  }

  if (folderStep) return accountRows(ctx, accountIdsOf(ctx.tree, folderStep.id), folderStep.label)
  if (sectionStep) {
    return accountRows(ctx, await sectionAccountIds(ctx, drill.metric, sectionStep.id), sectionStep.label)
  }
  return empty('drill.title.accounts', '')
}

export async function computeDrill(
  filter: AppContextFilter,
  drill: DrillState,
  offset: number = 0,
): Promise<DrillResult> {
  const [tree, periods, { entities }] = await Promise.all([getCachedCoaTree(), getCachedPeriods(), getCachedEntities()])
  const ctx: DrillContext = {
    filter,
    tree,
    periods,
    activePeriods: periods.filter((p) => filter.periodIds.includes(p.periodeId)),
    entities,
    offset,
  }

  const steps = new Map<DrillStepKind, DrillStep>()
  for (const s of drill.steps ?? []) steps.set(s.kind, s)

  // Leaf: settlement history of an AP/AR card (any metric)
  const cardStep = steps.get('card')
  if (cardStep) {
    const history = await cardSettlementHistory(cardStep.id)
    return {
      titleKey: 'drill.title.history',
      titleLabel: cardStep.label,
      columns: [col('docNumber', 'code'), col('txDate', 'date'), col('amount', 'money')],
      rows: history.map((h) => ({
        id: String(h.cardId),
        docNumber: h.transactionNumber || String(h.cardId),
        txDate: String(h.txDate).slice(0, 10),
        amount: D(h.amount || 0).toFixed(2),
      })),
      nextKind: null,
      hasMore: false,
    }
  }

  switch (drill.metric) {
    case 'apAging':
    case 'arAging':
      return apArDrill(ctx, drill, steps)
    case 'paymentPlan': {
      const dayStep = steps.get('day')
      return dayStep ? paymentPlanDrill(ctx, dayStep) : empty('drill.title.dueBills', '')
    }
    case 'cashPosition':
      return cashPositionDrill(ctx, steps)
    case 'inTransit':
      return inTransitDrill(ctx, steps)
    case 'cashFlow':
      return cashFlowDrill(ctx, steps)
    case 'expensePaid':
      return expensePaidDrill(ctx, steps)
    default:
      // revenue, pnl, fixedCost, budget and generic folder drills
      return glMetricDrill(ctx, drill, steps)
  }
}
