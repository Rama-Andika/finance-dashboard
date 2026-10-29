import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D } from '~/lib/core/money'
import { type Entity, type Id, type IsoDate, type Period } from '~/lib/core/types'
import { type AppContextFilter } from '~/server/context'
import { journalHeaders, journalLines, movementsByPeriods } from '~/server/repo/gl.repo'
import { tablesBetween } from '~/server/db/gl-tables'
import { listPlanStatuses } from '~/server/repo/payment-plan.repo'
import { postableDescendants, type CoaTree } from '~/lib/finance/coa/coa-tree'
import { signedAmount } from '~/lib/finance/coa/sign'
import { getJournalGroupKey } from '~/lib/finance/journal/journal-type'
import { bucketOf, planStatus } from '~/lib/finance/ap-ar/aging'
import { type ClassifiedCashPortion } from '~/server/services/cash-flow.service'
import { type DrillStep, type DrillStepKind } from '~/lib/filters/search-schema'

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

export const PAGE_SIZE = 200
export { AP_BILL_ITEM_TYPES } from '~/lib/finance/ap-ar/expense-paid'

export const col = (id: string, kind: DrillColumnKind, labelKey = `drill.col.${id}`): DrillColumn => ({
  id,
  labelKey,
  kind,
})

export const ACCOUNT_COLUMNS = [col('code', 'code'), col('name', 'text'), col('amount', 'money')]
export const NAMED_TOTAL_COLUMNS = [col('code', 'code'), col('name', 'text'), col('amount', 'money')]
export const JOURNAL_COLUMNS = [
  col('journalNumber', 'code'),
  col('transDate', 'date'),
  col('journalTypeKey', 'text'),
  col('memo', 'text'),
  col('debet', 'money'),
  col('credit', 'money'),
]
export const PORTION_COLUMNS = [col('docNumber', 'code'), col('transDate', 'date'), col('memo', 'text'), col('amount', 'money')]

export type DrillContext = {
  filter: AppContextFilter
  tree: CoaTree
  periods: Period[]
  activePeriods: Period[]
  entities: Entity[]
  offset: number
}

/** One page (`PAGE_SIZE` rows from `offset`) of an already sorted list, and whether more rows follow. */
export function pageOf<T>(rows: readonly T[], offset: number): { page: T[]; hasMore: boolean } {
  return { page: rows.slice(offset, offset + PAGE_SIZE), hasMore: offset + PAGE_SIZE < rows.length }
}

export function empty(titleKey: string, titleLabel: string): DrillResult {
  return { titleKey, titleLabel, columns: [], rows: [], nextKind: null, hasMore: false }
}

/** Amount signed by the account group's natural side (G17), not raw credit − debet. */
export function signedFor(tree: CoaTree, coaId: Id, debet: string, credit: string): Decimal {
  const node = tree.byId.get(coaId)
  if (!node) return D(credit).minus(D(debet))
  return D(signedAmount(node.accountGroup, debet, credit))
}

export function accountIdsOf(tree: CoaTree, coaId: Id): Id[] {
  const node = tree.byId.get(coaId)
  if (!node) return []
  return node.status === 'POSTABLE' ? [coaId] : postableDescendants(tree, coaId)
}

/** Segment ids of the selected entity step, or the global filter's. */
export function segIdsFor(ctx: DrillContext, entityStep?: DrillStep): Id[] | 'all' {
  if (!entityStep) return ctx.filter.segmentDetailIds
  const ent = ctx.entities.find((e) => e.locationId === entityStep.id || e.code === entityStep.id)
  return ent ? ent.segmentDetailIds : []
}

export function hasSingleEntity(ctx: DrillContext): boolean {
  return ctx.filter.locationIds !== 'all' && ctx.filter.locationIds.length === 1
}

/** Accounts with their period movement, signed per account group. */
export async function accountRows(ctx: DrillContext, coaIds: Id[], label: string): Promise<DrillResult> {
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
export async function entityRows(ctx: DrillContext, coaIds: Id[], label: string): Promise<DrillResult> {
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

export async function journalRows(
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
    tables: dateRange ? tablesBetween(ctx.periods, dateRange.from, dateRange.to, 'gl') : undefined,
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
export async function portionJournalRows(
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

export function matchesBucket(asOf: IsoDate, dueDate: IsoDate, targetBucket: string): boolean {
  const b = bucketOf(asOf, dueDate)
  if (targetBucket === 'notDue') return b.startsWith('due')
  if (targetBucket === 'd0_30' || targetBucket === 'overdue0_30') return b === 'overdue0_30'
  if (targetBucket === 'd31_60' || targetBucket === 'overdue31_60') return b === 'overdue31_60'
  if (targetBucket === 'd61_90' || targetBucket === 'overdue61_90') return b === 'overdue61_90'
  if (targetBucket === 'd90plus' || targetBucket === 'overdue90plus') return b === 'overdue90plus'
  return b === targetBucket
}

export async function statusMapFor(invoiceIds: Id[]): Promise<Map<Id, string>> {
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

