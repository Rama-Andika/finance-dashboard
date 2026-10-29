import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D } from '~/lib/core/money'
import { diffDays } from '~/lib/format/date'
import { type Entity, type Id, type IsoDate } from '~/lib/core/types'
import { unsettledByChannel, unsettledTransactions } from '~/server/repo/bank-payment.repo'
import { resolveBaskets } from '~/lib/finance/coa/basket-resolver'
import { loadAccountMapping } from '~/server/services/shared/mapping.helper'
import { balancesAt } from '~/server/services/balance.service'
import { type DrillStep, type DrillStepKind } from '~/lib/filters/search-schema'
import { PAGE_SIZE, col, empty, accountIdsOf, segIdsFor, journalRows, type DrillContext, type DrillResult } from '~/server/services/drill/shared'

// ---------------------------------------------------------------------------
// Cash position & funds in transit
// ---------------------------------------------------------------------------

export async function cashPositionDrill(ctx: DrillContext, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
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

export async function inTransitDrill(ctx: DrillContext, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
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

