import { D, sum } from '../../core/money'
import { signedAmount } from '../coa/sign'
import type { AccountGroup, Breakdown, Id, Money } from '../../core/types'
import { type CoaTree, type CoaNode, postableDescendants } from '../coa/coa-tree'

export type RevenueMovement = {
  coaId: Id
  periodId?: Id
  locationId?: Id
  debet: Money
  credit: Money
}

/**
 * Composition folders of an account group:
 * Direct children of the smallest root covering every POSTABLE of that group.
 */
export function groupFolders(tree: CoaTree, group: AccountGroup): CoaNode[] {
  // 1. Take all POSTABLE of this group
  const postables: CoaNode[] = []
  for (const node of tree.byId.values()) {
    if (node.status === 'POSTABLE' && node.accountGroup === group && node.coaId !== '__orphans__') {
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
    const descIds =
      folder.status === 'POSTABLE'
        ? [folder.coaId]
        : postableDescendants(tree, folder.coaId)

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
