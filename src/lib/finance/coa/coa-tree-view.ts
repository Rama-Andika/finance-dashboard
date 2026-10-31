import type { Id } from '../../core/types'
import type { CoaNode, CoaTree } from './coa-tree'

/** One visible row of the account picker. */
export type FlatNode = {
  node: CoaNode
  depth: number
  hasChildren: boolean
  isExpanded: boolean
}

/**
 * Ids of the accounts whose name or code contains `query` (case-insensitive),
 * plus all their ancestors (so the path to each hit stays visible)
 * and all their descendants (so opening a matching folder reveals its contents).
 * `null` when the query is empty (nothing is filtered).
 */
export function matchingCoaIds(tree: CoaTree, query: string): Set<Id> | null {
  const q = query.trim().toLowerCase()
  if (!q) return null

  const matched = new Set<Id>()

  const addDescendants = (node: CoaNode) => {
    for (const child of node.children) {
      matched.add(child.coaId)
      addDescendants(child)
    }
  }

  for (const node of tree.byId.values()) {
    if (!node.name.toLowerCase().includes(q) && !node.code.toLowerCase().includes(q)) continue
    matched.add(node.coaId)

    // Add ancestors
    let parent = node.parentId ? tree.byId.get(node.parentId) : undefined
    while (parent) {
      matched.add(parent.coaId)
      parent = parent.parentId ? tree.byId.get(parent.parentId) : undefined
    }

    // Add descendants so folder contents are included
    addDescendants(node)
  }
  return matched
}

/**
 * The rows to show, in tree order: a collapsed branch hides its children.
 * While a search is active, only matching branches are listed; they default to open unless collapsed.
 */
export function flattenVisible(
  tree: CoaTree,
  expandedIds: ReadonlySet<Id>,
  matchingIds: ReadonlySet<Id> | null,
  collapsedIds?: ReadonlySet<Id>,
): FlatNode[] {
  const items: FlatNode[] = []

  const walk = (nodes: CoaNode[], depth: number) => {
    for (const node of nodes) {
      if (matchingIds && !matchingIds.has(node.coaId)) continue

      const hasChildren = node.children.length > 0
      const isExpanded = matchingIds
        ? !collapsedIds?.has(node.coaId)
        : expandedIds.has(node.coaId)
      items.push({ node, depth, hasChildren, isExpanded })

      if (hasChildren && isExpanded) walk(node.children, depth + 1)
    }
  }

  walk(tree.roots, 0)
  return items
}
