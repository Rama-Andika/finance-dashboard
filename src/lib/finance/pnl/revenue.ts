import Decimal from 'decimal.js'
import { D, addTo, sum } from '../../core/money'
import { signedAmount, signedDecimal } from '../coa/sign'
import type { AccountGroup, Breakdown, Id, Money } from '../../core/types'
import { type CoaTree, type CoaNode, ORPHAN_FOLDER_ID, postableDescendants } from '../coa/coa-tree'

/**
 * Composition folders of an account group:
 * Direct children of the smallest root covering every POSTABLE of that group.
 */
export function groupFolders(tree: CoaTree, group: AccountGroup): CoaNode[] {
  // 1. Take all POSTABLE of this group
  const postables: CoaNode[] = []
  for (const node of tree.byId.values()) {
    if (node.status === 'POSTABLE' && node.accountGroup === group && node.coaId !== ORPHAN_FOLDER_ID) {
      postables.push(node)
    }
  }

  if (postables.length === 0) return []

  // Check if every POSTABLE descendant of a node belongs to this group
  function isPureGroup(nodeId: Id): boolean {
    const node = tree.byId.get(nodeId)
    if (!node) return false
    if (node.status === 'POSTABLE') {
      return node.accountGroup === group
    }
    const descs = postableDescendants(tree, nodeId)
    if (descs.length === 0) return false
    return descs.every((id) => tree.byId.get(id)?.accountGroup === group)
  }

  // 2. For each postable account, climb up to parent as long as parent is pure group
  const groupRootsSet = new Set<string>()
  for (const p of postables) {
    let curr: CoaNode = p
    while (curr.parentId && curr.parentId !== '0') {
      const parentNode = tree.byId.get(curr.parentId)
      if (parentNode && isPureGroup(parentNode.coaId)) {
        curr = parentNode
      } else {
        break
      }
    }
    groupRootsSet.add(curr.coaId)
  }

  const groupRoots = Array.from(groupRootsSet)
    .map((id) => tree.byId.get(id)!)
    .filter(Boolean)

  // 3. If single root covering all -> folder = its direct children
  if (groupRoots.length === 1) {
    const singleRoot = groupRoots[0]!
    const directChildren = singleRoot.children ?? []

    if (directChildren.length > 0) {
      return directChildren
    }
    return [singleRoot]
  }

  return groupRoots
}

/**
 * Calculate net revenue: Σ (credit − debet)
 */
export function computeNetRevenue(debet: Money, credit: Money): Money {
  return signedAmount('Revenue', debet, credit)
}

/**
 * Builds breakdown folders for Revenue.
 */
export function buildRevenueBreakdown(
  tree: CoaTree,
  folders: CoaNode[],
  movementsByCoa: Map<Id, { debet: Money; credit: Money }>,
): Breakdown[] {
  const result: Breakdown[] = []

  for (const folder of folders) {
    const descIds = folder.status === 'POSTABLE' ? [folder.coaId] : postableDescendants(tree, folder.coaId)

    const children: Breakdown[] = []
    let folderSum = D(0)

    for (const coaId of descIds) {
      const node = tree.byId.get(coaId)
      const mov = movementsByCoa.get(coaId)
      const debet = mov?.debet ?? '0.00'
      const credit = mov?.credit ?? '0.00'
      const net = computeNetRevenue(debet, credit)

      folderSum = folderSum.plus(D(net))

      children.push({
        id: coaId,
        label: node?.name ?? `Account ${coaId}`,
        code: node?.code,
        amount: net,
      })
    }

    result.push({
      id: folder.coaId,
      label: folder.name,
      code: folder.code,
      amount: folderSum.toFixed(2),
      children,
    })
  }

  return result
}

/** A movement row as the Revenue read returns it (the period and location are present when they were asked for). */
export type RevenueMovement = {
  coaId: Id
  periodId?: Id | null
  locationId?: Id | null
  debet: Money
  credit: Money
}

export type RevenueAggregate = {
  /** Net revenue of every row. */
  total: Decimal
  /** Debit and credit per account (not rounded: the caller rounds what it shows). */
  byCoa: Map<Id, { debet: Decimal; credit: Decimal }>
  byPeriod: Map<Id, Decimal>
  byLocation: Map<Id, Decimal>
}

/** Net revenue (credit - debit) of rows, e.g. the rows of a comparison period. */
export function sumNetRevenue(rows: readonly Pick<RevenueMovement, 'debet' | 'credit'>[]): Decimal {
  return rows.reduce((acc, r) => acc.plus(signedDecimal('Revenue', r.debet, r.credit)), D(0))
}

/** One pass over the rows: the total and the totals per account, per period and per location. */
export function aggregateRevenue(rows: readonly RevenueMovement[]): RevenueAggregate {
  let total = D(0)
  const byCoa = new Map<Id, { debet: Decimal; credit: Decimal }>()
  const byPeriod = new Map<Id, Decimal>()
  const byLocation = new Map<Id, Decimal>()

  for (const r of rows) {
    const net = signedDecimal('Revenue', r.debet, r.credit)
    total = total.plus(net)

    const coa = byCoa.get(r.coaId) ?? { debet: D(0), credit: D(0) }
    byCoa.set(r.coaId, { debet: coa.debet.plus(D(r.debet)), credit: coa.credit.plus(D(r.credit)) })

    if (r.periodId) addTo(byPeriod, r.periodId, net)
    if (r.locationId) addTo(byLocation, r.locationId, net)
  }
  return { total, byCoa, byPeriod, byLocation }
}

/** Debit and credit per account as 2-decimal strings, the shape `buildRevenueBreakdown` takes. */
export function movementsByCoaOf(
  byCoa: ReadonlyMap<Id, { debet: Decimal; credit: Decimal }>,
): Map<Id, { debet: Money; credit: Money }> {
  return new Map(Array.from(byCoa, ([coaId, m]) => [coaId, { debet: m.debet.toFixed(2), credit: m.credit.toFixed(2) }]))
}

/** Revenue per calendar month ('YYYY-MM'): the sum of the periods that start in that month. */
export function revenueTrend(
  byPeriod: ReadonlyMap<Id, Decimal>,
  periods: readonly { periodeId: Id; startDate: string }[],
  months: readonly string[],
): Array<{ month: string; amount: Money }> {
  const monthOfPeriod = new Map(periods.map((p) => [p.periodeId, p.startDate.slice(0, 7)]))
  const byMonth = new Map<string, Decimal>()
  for (const [periodId, amount] of byPeriod) {
    const month = monthOfPeriod.get(periodId)
    if (month !== undefined) addTo(byMonth, month, amount)
  }
  return months.map((month) => ({ month, amount: (byMonth.get(month) ?? D(0)).toFixed(2) }))
}

/**
 * Revenue per entity row, and the revenue that belongs to no entity row (journal lines without a location, or of a
 * location outside the list): the total minus the sum of the rows.
 */
export function splitRevenueByEntity(
  entities: readonly { locationId: Id; code: string; name: string }[],
  byLocation: ReadonlyMap<Id, Decimal>,
  total: Decimal,
): { byEntity: Array<{ id: Id; code: string; name: string; amount: Money }>; entityUnassigned: Money } {
  const byEntity = entities.map((e) => ({
    id: e.locationId,
    code: e.code,
    name: e.name,
    amount: (byLocation.get(e.locationId) ?? D(0)).toFixed(2),
  }))
  const entityUnassigned = total.minus(D(sum(byEntity.map((e) => e.amount)))).toFixed(2)
  return { byEntity, entityUnassigned }
}
