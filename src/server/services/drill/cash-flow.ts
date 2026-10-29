import '@tanstack/react-start/server-only'
import Decimal from 'decimal.js'
import { D } from '~/lib/finance/money'
import { addDays } from '~/lib/format/date'
import { type Id, type IsoDate } from '~/lib/finance/types'
import { expensePaidAllocated, expensePaidUnallocated, listVendors } from '~/server/repo/apar.repo'
import { isDirectExpenseGroup } from '~/lib/finance/account-groups'
import { resolveBaskets } from '~/lib/finance/basket-resolver'
import { loadAccountMapping } from '~/server/services/mapping.helper'
import { loadClassifiedPortions } from '~/server/services/cash-flow.service'
import { type DrillStep, type DrillStepKind } from '~/lib/filters/search-schema'
import { AP_BILL_ITEM_TYPES, col, ACCOUNT_COLUMNS, NAMED_TOTAL_COLUMNS, empty, accountIdsOf, portionJournalRows, type DrillContext, type DrillResult } from '~/server/services/drill/shared'

// ---------------------------------------------------------------------------
// Cash flow & expense paid (built on classified cash portions)
// ---------------------------------------------------------------------------

export async function cashFlowDrill(ctx: DrillContext, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
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

export async function expensePaidDrill(ctx: DrillContext, steps: Map<DrillStepKind, DrillStep>): Promise<DrillResult> {
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
    return inScope.has(p.counterCoaId) && D(p.portion).lt(0) && isDirectExpenseGroup(group ?? '')
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

