import type { BasketKey, Id } from '../../core/types'
import {
  type CoaTree,
  type CoaNode,
  postableDescendants,
  ancestorsOf,
} from './coa-tree'

export type AccountMapping = {
  version: 1
  updatedAt: string
  baskets: Record<BasketKey, { include: Id[] }>
}

export type ResolvedBaskets = Record<BasketKey, Id[]> & { missing: Id[] }

const BASKET_KEYS: readonly BasketKey[] = [
  'cash',
  'bank',
  'deposit',
  'inTransit',
  'fixedCost',
]

/** Resolves each basket: HEADER -> all POSTABLE descendants, POSTABLE -> itself, dedupe, unknown ID -> missing. */
export function resolveBaskets(mapping: AccountMapping, tree: CoaTree): ResolvedBaskets {
  const missingSet = new Set<Id>()
  const resolved: Record<BasketKey, Id[]> = {
    cash: [],
    bank: [],
    deposit: [],
    inTransit: [],
    fixedCost: [],
  }

  for (const key of BASKET_KEYS) {
    const basket = mapping.baskets[key]
    const include = basket?.include ?? []
    const postablesSet = new Set<Id>()

    for (const id of include) {
      const node = tree.byId.get(id)
      if (!node) {
        missingSet.add(id)
        continue
      }

      if (node.status === 'POSTABLE') {
        postablesSet.add(node.coaId)
      } else {
        const descendants = postableDescendants(tree, node.coaId)
        for (const descId of descendants) {
          postablesSet.add(descId)
        }
      }
    }

    resolved[key] = Array.from(postablesSet).sort()
  }

  return {
    ...resolved,
    missing: Array.from(missingSet).sort(),
  }
}

function isNodeDirectlyOrViaAncestorIncluded(
  includeSet: Set<Id>,
  tree: CoaTree,
  coaId: Id,
): boolean {
  if (includeSet.has(coaId)) return true
  const ancestors = ancestorsOf(tree, coaId)
  return ancestors.some((aId) => includeSet.has(aId))
}

/** Checkbox state of a node for the UI: 'checked' (☑), 'partial' (◐), 'unchecked'. */
export function checkState(
  include: Id[],
  tree: CoaTree,
  coaId: Id,
): 'checked' | 'partial' | 'unchecked' {
  const node = tree.byId.get(coaId)
  if (!node) return 'unchecked'

  const includeSet = new Set(include)

  if (node.status === 'POSTABLE') {
    return isNodeDirectlyOrViaAncestorIncluded(includeSet, tree, coaId)
      ? 'checked'
      : 'unchecked'
  }

  // HEADER / Folder node
  const postables = postableDescendants(tree, coaId)
  if (postables.length === 0) {
    return isNodeDirectlyOrViaAncestorIncluded(includeSet, tree, coaId)
      ? 'checked'
      : 'unchecked'
  }

  let includedCount = 0
  for (const pId of postables) {
    if (isNodeDirectlyOrViaAncestorIncluded(includeSet, tree, pId)) {
      includedCount++
    }
  }

  if (includedCount === postables.length) {
    return 'checked'
  }
  if (includedCount > 0) {
    return 'partial'
  }
  return 'unchecked'
}

function expandAncestorExcludingTarget(
  ancestor: CoaNode,
  targetId: Id,
  tree: CoaTree,
  targetAncestors: Set<Id>,
): Id[] {
  const result: Id[] = []
  for (const child of ancestor.children) {
    if (child.coaId === targetId) {
      // Exclude target
      continue
    }
    if (targetAncestors.has(child.coaId)) {
      // Child is an intermediate ancestor of target, expand further down
      result.push(...expandAncestorExcludingTarget(child, targetId, tree, targetAncestors))
    } else {
      result.push(child.coaId)
    }
  }
  return result
}

function getAllDescendantIds(tree: CoaTree, coaId: Id): Set<Id> {
  const node = tree.byId.get(coaId)
  if (!node) return new Set()
  const result = new Set<Id>()
  const queue = [...node.children]
  while (queue.length > 0) {
    const c = queue.shift()!
    result.add(c.coaId)
    queue.push(...c.children)
  }
  return result
}

/** Checkbox click. Returns the new, normalized include list. */
export function toggleNode(include: Id[], tree: CoaTree, coaId: Id): Id[] {
  const currentState = checkState(include, tree, coaId)
  const node = tree.byId.get(coaId)
  if (!node) return include

  let nextInclude = [...include]
  const descendants = getAllDescendantIds(tree, coaId)

  if (currentState !== 'checked') {
    // Want to CHECK it:
    // 1. Add coaId
    nextInclude.push(coaId)

    // 2. Remove all its descendants from include (since coaId now covers them)
    nextInclude = nextInclude.filter((id) => !descendants.has(id))
  } else {
    // Want to UNCHECK it:
    // 1. Check if covered because an ancestor is in include
    const ancestors = ancestorsOf(tree, coaId)
    const targetAncestors = new Set(ancestors)
    const lowestAncestorId = ancestors.find((aId) => nextInclude.includes(aId))

    if (lowestAncestorId) {
      nextInclude = nextInclude.filter((id) => id !== lowestAncestorId)
      const ancestorNode = tree.byId.get(lowestAncestorId)!
      const replacementIds = expandAncestorExcludingTarget(
        ancestorNode,
        coaId,
        tree,
        targetAncestors,
      )
      nextInclude.push(...replacementIds)
    }

    // 2. Remove coaId itself and all its descendants from nextInclude
    const toRemove = new Set([coaId, ...descendants])
    nextInclude = nextInclude.filter((id) => !toRemove.has(id))
  }

  // Deduplicate and sort
  return Array.from(new Set(nextInclude)).sort()
}
